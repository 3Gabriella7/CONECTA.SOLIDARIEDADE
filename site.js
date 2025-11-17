const express = require("express");
const session = require("express-session");
const sqlite3 = require("sqlite3").verbose();

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const PORT = 8000;
const db = new sqlite3.Database("doacoes.db");

// --- BANCO DE DADOS ---
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS cadastro (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE,
    senha TEXT,
    confirmarsenha TEXT,
    tipo_usuario TEXT,
    codigo_da_sala TEXT
  )`);

    db.run(`CREATE TABLE IF NOT EXISTS doacoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo_campanha TEXT,
    item_doado TEXT,
    quantidade INT,
    data DATE,
    pontuacao_final INT,
    usuario_id INT
  )`);

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

app.use('/static', express.static(__dirname + '/static'));
app.use(session({
    secret: 'segredo',
    resave: false,
    saveUninitialized: true
}));
app.set('view engine', 'ejs');

// PÁGINA INICIAL
app.get("/", (req, res) => {
    const tipo_usuario = req.session.tipo_usuario || null;
    const isAdmin = tipo_usuario === "admin";
    const isDocente = tipo_usuario === "docente";
    const isAluno = tipo_usuario === "aluno";
    const email = req.session.email || null; // adiciona o email da sessão
    res.render("pages/index", { isAdmin, isDocente, isAluno, email });
});

// CADASTRO
app.get("/cadastro", (req, res) => {
    const mensagem = req.query.mensagem || "";
    const email = req.session.email || null;
    res.render("pages/cadastro", { req, mensagem, email });
});

app.post("/cadastro", (req, res) => {
    const { email, senha, confirmarsenha, tipo_usuario, codigo_da_sala } = req.body;
    const sessionEmail = req.session.email || null;

    if (!email || !senha || !confirmarsenha || !tipo_usuario)
        return res.render("pages/cadastro", { mensagem: "Preencha todos os campos", req, email: sessionEmail });

    if (tipo_usuario !== "admin" && !codigo_da_sala)
        return res.render("pages/cadastro", { mensagem: "Preencha todos os campos", req, email: sessionEmail });

    if (senha !== confirmarsenha)
        return res.render("pages/cadastro", { mensagem: "As senhas não batem", req, email: sessionEmail });

    const queryCheck = "SELECT * FROM cadastro WHERE email = ?";
    db.get(queryCheck, [email], (err, row) => {
        if (err) throw err;
        if (row) return res.render("pages/cadastro", { mensagem: "Email já cadastrado", req, email: sessionEmail });

        const salaParaSalvar = tipo_usuario === "admin" ? "" : codigo_da_sala;
        const insert = `INSERT INTO cadastro (email, senha, confirmarsenha, tipo_usuario, codigo_da_sala)
                    VALUES (?, ?, ?, ?, ?)`;
        db.run(insert, [email, senha, confirmarsenha, tipo_usuario, salaParaSalvar], function (err) {
            if (err) throw err;
            res.redirect("/login?mensagem=Cadastro realizado com sucesso");
        });
    });
});

// LOGIN
app.get("/login", (req, res) => {
    const mensagem = req.query.mensagem || "";
    const email = req.session.email || null;
    res.render("pages/login", { mensagem, email });
});

app.post("/login", (req, res) => {
    const { email, senha } = req.body;
    if (!email || !senha) return res.redirect("/login?mensagem=Preencha todos os campos");

    const query = "SELECT * FROM cadastro WHERE email=? AND senha=?";
    db.get(query, [email, senha], (err, row) => {
        if (err) throw err;
        if (!row) return res.redirect("/login?mensagem=Usuário ou senha inválidos");

        req.session.loggedin = true;
        req.session.email = row.email;
        req.session.usuario_id = row.id;
        req.session.tipo_usuario = row.tipo_usuario;

        return res.redirect("/");
    });
});

// DOAR
app.get("/doar", (req, res) => {
    if (!req.session.loggedin) return res.redirect("/login");
    const email = req.session.email || null;
    res.render("pages/doar", { mensagem: "", email });
});

app.post("/doar", (req, res) => {
    const { tipo_campanha, item_doado, quantidade, data } = req.body;
    const usuario_id = req.session.usuario_id;
    const pontuacao_final = quantidade * 10;

    const query = `INSERT INTO doacoes (tipo_campanha, item_doado, quantidade, data, pontuacao_final, usuario_id)
                 VALUES (?, ?, ?, ?, ?, ?)`;
    db.run(query, [tipo_campanha, item_doado, quantidade, data, pontuacao_final, usuario_id], function (err) {
        if (err) throw err;
        res.redirect("/conclusao");
    });
});

// RANKING
app.get("/ranking", (req, res) => {
    const email = req.session.email || null;
    const query = `
    SELECT c.email, d.tipo_campanha, SUM(d.pontuacao_final) AS pontos_totais
    FROM doacoes d
    JOIN cadastro c ON d.usuario_id = c.id
    GROUP BY d.usuario_id, d.tipo_campanha
    ORDER BY pontos_totais DESC
  `;
    db.all(query, [], (err, rows) => {
        if (err) throw err;
        res.render("pages/ranking", { dados: rows, email });
    });
});

// ADMIN
// Página principal de edição de campanhas
app.get("/edicamp", (req, res) => {
    if (req.session.tipo_usuario !== "admin") return res.redirect("/");
    const email = req.session.email || null;

    db.all("SELECT * FROM campanhas", (err, campanhas) => {
        if (err) throw err;
        res.render("pages/edicamp", { email, campanhas, mensagem: req.query.mensagem || "" });
    });
});

// Adicionar nova campanha
app.post("/edicamp/add", (req, res) => {
    const { nome, descricao, imagem, item_doavel, pontos } = req.body;

    if (!nome || !descricao || !item_doavel || !pontos)
        return res.redirect("/edicamp?mensagem=Preencha todos os campos");

    const insert = `
        INSERT INTO campanhas (nome, descricao, imagem, item_doavel, pontos)
        VALUES (?, ?, ?, ?, ?)
    `;
    db.run(insert, [nome, descricao, imagem, item_doavel, pontos], (err) => {
        if (err) throw err;
        res.redirect("/?mensagem=Campanha Efetuada com Sucesso");
    });
});

// Excluir campanha
app.post("/edicamp/delete/:id", (req, res) => {
    const id = req.params.id;
    db.run("DELETE FROM campanhas WHERE id = ?", [id], (err) => {
        if (err) throw err;
        res.redirect("/edicamp?mensagem=Campanha Excluída com Sucesso");
    });
});

app.get("/ediusua", (req, res) => {
    if (req.session.tipo_usuario !== "admin") return res.redirect("/");
    const email = req.session.email || null;
    res.render("pages/ediusua", { email });
});

// CONCLUSÃO
app.get("/conclusao", (req, res) => {
    if (!req.session.usuario_id) return res.redirect("/login");
    const email = req.session.email || null;
    res.render("pages/conclusao", { email, req });
});

// INFO e CP
app.get("/info", (req, res) => {
    const email = req.session.email || null;
    res.render("pages/info", { email });
});

app.get("/cp", (req, res) => {
    const email = req.session.email || null;
    res.render("pages/cp", { email });
});

// LOGOUT
app.get("/logout", (req, res) => {
    req.session.destroy(() => res.redirect("/"));
});

// ERRO 404
app.use((req, res) => {
    res.status(404).render("pages/erro", { msg: "Página não encontrada" });
});

// INICIAR SERVIDOR
app.listen(PORT, () => {
    console.log(`Servidor sendo executado na porta ${PORT}`);
    console.log(__dirname + "/static");
});