// ---------------------------------------------------------
// IMPORTS E CONFIGURAÇÃO
// ---------------------------------------------------------
const express = require("express");
const session = require("express-session");
const sqlite3 = require("sqlite3").verbose();

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const multer = require("multer");

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, "static/uploads"),
    filename: (req, file, cb) =>
        cb(null, Date.now() + "-" + file.originalname)
});

const upload = multer({ storage });

const PORT = 8000;
const db = new sqlite3.Database("doacoes.db");

app.use("/static", express.static(__dirname + "/static"));

app.use(session({
    secret: "segredo",
    resave: false,
    saveUninitialized: true
}));

app.set("view engine", "ejs");

// ---------------------------------------------------------
// BANCO DE DADOS
// ---------------------------------------------------------
db.serialize(() => {
    // Usuários
    db.run(`
        CREATE TABLE IF NOT EXISTS cadastro (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE,
            senha TEXT,
            confirmarsenha TEXT,
            tipo_usuario TEXT,
            codigo_da_sala TEXT
        )
    `);

    // Doações
    db.run(`
        CREATE TABLE IF NOT EXISTS doacoes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            campanha_id INT,
            item_doado TEXT,
            quantidade INT,
            data DATE,
            codigo_da_sala TEXT,
            pontuacao_final INT,
            usuario_id INT
        )
    `);

    // Campanhas
    db.run(`
        CREATE TABLE IF NOT EXISTS campanhas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            descricao TEXT NOT NULL,
            imagem TEXT,
            itens TEXT NOT NULL
        )
    `);
});

// ---------------------------------------------------------
// MIDDLEWARE GLOBAL – HEADER DINÂMICO
// ---------------------------------------------------------
app.use((req, res, next) => {
    const tipo = req.session.tipo_usuario || null;

    res.locals.email = req.session.email || null;
    res.locals.isAdmin = tipo === "admin";
    res.locals.isDocente = tipo === "docente";
    res.locals.isAluno = tipo === "aluno";

    next();
});

// ---------------------------------------------------------
// ROTAS PÚBLICAS
// ---------------------------------------------------------
app.get("/", (req, res) => {
    const mensagem = req.session.mensagem || null;
    req.session.mensagem = null;

    res.render("pages/index", {
        email: req.session.email || null,
        isAdmin: res.locals.isAdmin,
        isDocente: res.locals.isDocente,
        isAluno: res.locals.isAluno,
        mensagem
    });
});

// Cadastro
app.get("/cadastro", (req, res) => {
    res.render("pages/cadastro", { mensagem: req.query.mensagem || "" });
});

app.post("/cadastro", (req, res) => {
    const { email, senha, confirmarsenha, tipo_usuario, codigo_da_sala } = req.body;

    if (!email || !senha || !confirmarsenha || !tipo_usuario)
        return res.render("pages/cadastro", { mensagem: "Preencha todos os campos" });

    if (senha !== confirmarsenha)
        return res.render("pages/cadastro", { mensagem: "As senhas não batem" });

    db.get("SELECT * FROM cadastro WHERE email=?", [email], (err, row) => {
        if (row)
            return res.render("pages/cadastro", { mensagem: "Email já cadastrado" });

        const codigo = tipo_usuario === "admin" ? "" : codigo_da_sala;

        db.run(
            `INSERT INTO cadastro (email, senha, confirmarsenha, tipo_usuario, codigo_da_sala)
             VALUES (?, ?, ?, ?, ?)`,
            [email, senha, confirmarsenha, tipo_usuario, codigo],
            () => res.redirect("/login?mensagem=Cadastro realizado com sucesso")
        );
    });
});

// ---------------------------------------------------------
// LOGIN / LOGOUT
// ---------------------------------------------------------
app.get("/login", (req, res) => {
    res.render("pages/login", { mensagem: req.query.mensagem || "" });
});

app.post("/login", (req, res) => {
    const { email, senha } = req.body;

    db.get(
        "SELECT * FROM cadastro WHERE email=? AND senha=?",
        [email, senha],
        (err, row) => {
            if (!row)
                return res.redirect("/login?mensagem=Usuário ou senha inválidos");

            req.session.loggedin = true;
            req.session.email = row.email;
            req.session.usuario_id = row.id;
            req.session.tipo_usuario = row.tipo_usuario;

            return res.redirect("/");
        }
    );
});

app.get("/logout", (req, res) => {
    req.session.destroy(() => res.redirect("/"));
});

// ---------------------------------------------------------
// DOAR
// ---------------------------------------------------------
app.get("/doar", (req, res) => {
    if (!req.session.loggedin) return res.redirect("/login");

    db.all("SELECT * FROM campanhas", [], (err, campanhas) => {
        res.render("pages/doar", { campanhas });
    });
});

app.get("/doar/:id", (req, res) => {
    const id = req.params.id;

    db.get("SELECT * FROM campanhas WHERE id=?", [id], (err, campanha) => {
        if (!campanha) return res.send("Campanha não encontrada");

        campanha.itens = JSON.parse(campanha.itens);

        res.render("pages/doar_campanha", { campanha });
    });
});

app.post("/doar/:id", (req, res) => {
    const id = req.params.id;
    const { item_doado, quantidade, data, codigo_da_sala } = req.body;
    const usuario_id = req.session.usuario_id;

    db.get("SELECT itens FROM campanhas WHERE id=?", [id], (err, row) => {
        const itens = JSON.parse(row.itens);
        const item = itens.find(i => i.nome === item_doado);

        const pontos = item.pontos * quantidade;

        db.run(
            `INSERT INTO doacoes
            (campanha_id, item_doado, quantidade, data, codigo_da_sala, pontuacao_final, usuario_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [id, item_doado, quantidade, data, codigo_da_sala, pontos, usuario_id],
            () => res.redirect("/conclusao")
        );
    });
});

// ---------------------------------------------------------
// RANKING — UMA TABELA PARA CADA CAMPANHA
// ---------------------------------------------------------
app.get("/ranking", (req, res) => {
    db.all("SELECT id, nome FROM campanhas", [], (err, campanhas) => {
        const resultadoFinal = [];
        let contador = 0;

        if (campanhas.length === 0)
            return res.render("pages/ranking", { campanhas: [] });

        campanhas.forEach(camp => {
            db.all(
                `
                SELECT c.email, d.item_doado, d.quantidade, d.pontuacao_final
                FROM doacoes d
                JOIN cadastro c ON c.id = d.usuario_id
                WHERE d.campanha_id = ?
                ORDER BY d.pontuacao_final DESC
                LIMIT 10
                `,
                [camp.id],
                (err, rows) => {
                    resultadoFinal.push({
                        campanha: camp.nome,
                        dados: rows
                    });

                    contador++;
                    if (contador === campanhas.length) {
                        res.render("pages/ranking", { campanhas: resultadoFinal });
                    }
                }
            );
        });
    });
});

// ---------------------------------------------------------
// ROTAS ADMINISTRATIVAS
// ---------------------------------------------------------
app.get("/edicamp", (req, res) => {
    if (!res.locals.isAdmin) return res.redirect("/");

    db.all("SELECT * FROM campanhas", (err, campanhas) => {
        res.render("pages/edicamp", {
            campanhas,
            mensagem: req.query.mensagem || ""
        });
    });
});

app.post("/edicamp/add", upload.single("imagem"), (req, res) => {
    const { nome, descricao } = req.body;

    const itensBrutos = req.body.itens || {};
    const itensArray = Object.values(itensBrutos);
    const itensJSON = JSON.stringify(itensArray);

    if (!nome || !descricao || itensArray.length === 0)
        return res.redirect("/edicamp?mensagem=Preencha todos os campos");

    const imagem = req.file ? "/static/uploads/" + req.file.filename : null;

    db.run(
        `
        INSERT INTO campanhas (nome, descricao, imagem, itens)
        VALUES (?, ?, ?, ?)
        `,
        [nome, descricao, imagem, itensJSON],
        () => {
            req.session.mensagem = "Campanha criada com sucesso!";
            res.redirect("/");
        }
    );
});

app.post("/edicamp/delete/:id", (req, res) => {
    db.run("DELETE FROM campanhas WHERE id=?", [req.params.id], () => {
        res.redirect("/edicamp?mensagem=Campanha excluída");
    });
});

// Gerenciar usuários
app.get("/ediusua", (req, res) => {
    if (!res.locals.isAdmin) return res.redirect("/");
    res.render("pages/ediusua");
});

// ---------------------------------------------------------
// PÁGINAS EXTRAS
// ---------------------------------------------------------
app.get("/conclusao", (req, res) => {
    if (!req.session.usuario_id) return res.redirect("/login");
    res.render("pages/conclusao");
});

app.get("/info", (req, res) => res.render("pages/info"));

app.get("/cp", (req, res) => {
    db.all("SELECT * FROM campanhas", (err, campanhas) => {
        res.render("pages/cp", { campanhas });
    });
});

// ---------------------------------------------------------
// ERRO 404
// ---------------------------------------------------------
app.use((req, res) => {
    res.status(404).render("pages/erro", { msg: "Página não encontrada" });
});

// ---------------------------------------------------------
// INICIAR SERVIDOR
// ---------------------------------------------------------
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});