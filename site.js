// ---------------------------------------------------------
// IMPORTS E CONFIGURAÇÃO
// ---------------------------------------------------------
const express = require("express");
const session = require("express-session");
const sqlite3 = require("sqlite3").verbose();

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const PORT = 8000;
const db = new sqlite3.Database("doacoes.db");

app.use('/static', express.static(__dirname + '/static'));

app.use(session({
    secret: 'segredo',
    resave: false,
    saveUninitialized: true
}));

app.set('view engine', 'ejs');

// ---------------------------------------------------------
// BANCO DE DADOS
// ---------------------------------------------------------
db.serialize(() => {
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

    db.run(`
        CREATE TABLE IF NOT EXISTS doacoes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tipo_campanha TEXT,
            item_doado TEXT,
            quantidade INT,
            data DATE,
            pontuacao_final INT,
            usuario_id INT
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS campanhas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            descricao TEXT NOT NULL,
            imagem TEXT,
            item_doavel TEXT NOT NULL,
            pontos INTEGER NOT NULL
        )
    `);
});

// ---------------------------------------------------------
// MIDDLEWARE GLOBAL – VARIÁVEIS DO MENU HEADER
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
    res.render("pages/index");
});

// Cadastro (GET)
app.get("/cadastro", (req, res) => {
    const mensagem = req.query.mensagem || "";
    res.render("pages/cadastro", { mensagem });
});

// Cadastro (POST)
app.post("/cadastro", (req, res) => {
    const { email, senha, confirmarsenha, tipo_usuario, codigo_da_sala } = req.body;

    if (!email || !senha || !confirmarsenha || !tipo_usuario)
        return res.render("pages/cadastro", { mensagem: "Preencha todos os campos" });

    if (tipo_usuario !== "admin" && !codigo_da_sala)
        return res.render("pages/cadastro", { mensagem: "Preencha todos os campos" });

    if (senha !== confirmarsenha)
        return res.render("pages/cadastro", { mensagem: "As senhas não batem" });

    db.get("SELECT * FROM cadastro WHERE email = ?", [email], (err, row) => {
        if (row)
            return res.render("pages/cadastro", { mensagem: "Email já cadastrado" });

        const salaParaSalvar = tipo_usuario === "admin" ? "" : codigo_da_sala;

        const insert = `
            INSERT INTO cadastro (email, senha, confirmarsenha, tipo_usuario, codigo_da_sala)
            VALUES (?, ?, ?, ?, ?)
        `;

        db.run(insert, [email, senha, confirmarsenha, tipo_usuario, salaParaSalvar], () => {
            res.redirect("/login?mensagem=Cadastro realizado com sucesso");
        });
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

    if (!email || !senha)
        return res.redirect("/login?mensagem=Preencha todos os campos");

    const query = "SELECT * FROM cadastro WHERE email=? AND senha=?";

    db.get(query, [email, senha], (err, row) => {
        if (!row)
            return res.redirect("/login?mensagem=Usuário ou senha inválidos");

        req.session.loggedin = true;
        req.session.email = row.email;
        req.session.usuario_id = row.id;
        req.session.tipo_usuario = row.tipo_usuario;

        return res.redirect("/");
    });
});

app.get("/logout", (req, res) => {
    req.session.destroy(() => res.redirect("/"));
});

// ---------------------------------------------------------
// DOAR (apenas logados)
// ---------------------------------------------------------

app.get("/doar", (req, res) => {
    if (!req.session.loggedin) return res.redirect("/login");
    res.render("pages/doar", { mensagem: "" });
});

app.post("/doar", (req, res) => {
    const { tipo_campanha, item_doado, quantidade, data } = req.body;
    const usuario_id = req.session.usuario_id;
    const pontuacao_final = quantidade * 10;

    const query = `
        INSERT INTO doacoes (tipo_campanha, item_doado, quantidade, data, pontuacao_final, usuario_id)
        VALUES (?, ?, ?, ?, ?, ?)
    `;

    db.run(query, [tipo_campanha, item_doado, quantidade, data, pontuacao_final, usuario_id], () => {
        res.redirect("/conclusao");
    });
});

// ---------------------------------------------------------
// RANKING
// ---------------------------------------------------------

app.get("/ranking", (req, res) => {
    const query = `
        SELECT c.email, d.tipo_campanha, SUM(d.pontuacao_final) AS pontos_totais
        FROM doacoes d
        JOIN cadastro c ON d.usuario_id = c.id
        GROUP BY d.usuario_id, d.tipo_campanha
        ORDER BY pontos_totais DESC
    `;

    db.all(query, [], (err, rows) => {
        res.render("pages/ranking", { dados: rows });
    });
});

// ---------------------------------------------------------
// ROTAS ADMINISTRATIVAS
// ---------------------------------------------------------

// Gerenciar campanhas
app.get("/edicamp", (req, res) => {
    if (!res.locals.isAdmin) return res.redirect("/");

    db.all("SELECT * FROM campanhas", (err, campanhas) => {
        res.render("pages/edicamp", { campanhas, mensagem: req.query.mensagem || "" });
    });
});

// Adicionar campanha
app.post("/edicamp/add", (req, res) => {
    const { nome, descricao, imagem, item_doavel, pontos } = req.body;

    if (!nome || !descricao || !item_doavel || !pontos)
        return res.redirect("/edicamp?mensagem=Preencha todos os campos");

    const insert = `
        INSERT INTO campanhas (nome, descricao, imagem, item_doavel, pontos)
        VALUES (?, ?, ?, ?, ?)
    `;

    db.run(insert, [nome, descricao, imagem, item_doavel, pontos], () => {
        res.redirect("/edicamp?mensagem=Campanha adicionada com sucesso");
    });
});

// Excluir campanha
app.post("/edicamp/delete/:id", (req, res) => {
    db.run("DELETE FROM campanhas WHERE id = ?", [req.params.id], () => {
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

app.get("/info", (req, res) => {
    res.render("pages/info");
});

app.get("/cp", (req, res) => {
    res.render("pages/cp");
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
