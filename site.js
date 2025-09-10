const express = require("express"); //adiciona o express na sua aplicação
const session = require("express-session"); //adiciona o gerenciador de session do express
const sqlite3 = require("sqlite3").verbose(); //adiciona a biblioteca para manipular arquivos do SQLite3

const app = express(); //armazena as chamadas e propriedades da biblioteca express
//configuração Express para processar requisições POST com BODY PARAMETERS
//app.use(bodyparser.urlencoded({extended: true})); - Versão Express <= 4.x.x
app.use(express.urlencoded({ extended: true })); // Versão Express <= 5.x.x
app.use(express.json());

const PORT = 8000; //configura a porta TCP do express

//conexão com oo BD
const db = new sqlite3.Database("doacoes.db");
db.serialize(() => {
    db.run(
        "CREATE TABLE IF NOT EXISTS cadastro (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT, senha TEXT, confirmarsenha TEXT, tipo_usuario TEXT)"
    );
    db.run(
        "CREATE TABLE IF NOT EXISTS login (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT, senha TEXT)"
    );
    db.run(
        "CREATE TABLE IF NOT EXISTS doar_agasalho (id INTEGER PRIMARY KEY AUTOINCREMENT, item_doado INT, quantidade INT, data DATE, pontuacao_final INT, usuario_id INT)"
    );
    db.run(
        "CREATE TABLE IF NOT EXISTS doar_brinquedo (id INTEGER PRIMARY KEY AUTOINCREMENT, item_doado INT, quantidade INT, data DATE, pontuacao_final INT, usuario_id INT)"
    );
    db.run(
        "CREATE TABLE IF NOT EXISTS doar_alimento (id INTEGER PRIMARY KEY AUTOINCREMENT, item_doado INT, quantidade INT, data DATE, pontuacao_final INT, usuario_id INT)"
    );
    db.run(
        "CREATE TABLE IF NOT EXISTS doar_racao (id INTEGER PRIMARY KEY AUTOINCREMENT, item_doado INT, quantidade INT, data DATE, pontuacao_final INT, usuario_id INT)"
    );
    //db.run("DELETE FROM doar WHERE id = 4");
    //db.run("DELETE FROM login");
});

//configura a rota '/static' para a pasta '__dirname/static' do seu servidor
app.use('/static', express.static(__dirname + '/static'));

app.use(
    session({
        secret: 'segredo', // pode ser qualquer string
        resave: false,
        saveUninitialized: true
    }));

app.set('view engine', 'ejs'); //habilita a 'view engine' para usar o 'ejs'

//rota '/' (raiz) para o método GET /
app.get("/", (req, res) => {
    const nome = req.session.NomeLogado || null;
    res.render("pages/index", { nome });
    console.log("Nome da sessão:", req.session.NomeLogado);
})

app.get("/cadastro", (req, res) => {
    res.render("pages/cadastro", { req });
});
app.post("/cadastro", (req, res) => {
    console.log("POST /cadastro");
    console.log(JSON.stringify(req.body));

    const { email, senha, confirmarsenha, tipo_usuario } = req.body;

    if (!email || !senha || !confirmarsenha || !tipo_usuario) {
        return res.redirect("/cadastro?mensagem=Preencha todos os campos");
    }

    if (senha !== confirmarsenha) {
        return res.redirect("/cadastro?mensagem=As senhas não batem");
    }

    // salva também no cadastro (com tipo_usuario)
    const insertCadastro = "INSERT INTO cadastro (email, senha, confirmarsenha, tipo_usuario) VALUES (?, ?, ?, ?)";
    db.run(insertCadastro, [email, senha, confirmarsenha, tipo_usuario], function (err) {
        if (err) throw err;

        // e no login (somente email/senha)
        const insertLogin = "INSERT INTO login (email, senha) VALUES (?, ?)";
        db.run(insertLogin, [email, senha], function (err2) {
            if (err2) throw err2;
            console.log("Novo usuário cadastrado:", email, tipo_usuario);
            return res.redirect("/login?mensagem=Cadastro realizado com sucesso");
        });
    });
});

app.get("/login", (req, res) => {
    const mensagem = req.query.mensagem || "";
    res.render("pages/login", { mensagem });
});
app.post("/login", (req, res) => {
    console.log("POST /login");
    console.log(JSON.stringify(req.body));

    const { email, senha, campanha } = req.body; // agora inclui campanha

    if (!email || !senha || !campanha) {
        return res.redirect("/login?mensagem=Preencha todos os campos");
    }

    const query = "SELECT * FROM login WHERE email=? AND senha=?";
    db.get(query, [email, senha], (err, row) => {
        if (err) throw err;

        console.log(`row: ${JSON.stringify(row)}`);
        if (row) {
            req.session.loggedin = true;
            req.session.email = row.email;
            req.session.usuario_id = row.id;

            // redireciona direto para a campanha escolhida
            return res.redirect("/campanha/" + campanha);
        } else {
            return res.redirect("/login?mensagem=Usuário ou senha inválidos");
        }
    });
});

// DOAR AGASALHO
app.get("/doar/agasalho", (req, res) => {
    if (!req.session.usuario_id) {
        return res.redirect("/login");
    }
    res.render("pages/doar_agasalho", { req });
});
app.post("/doar/agasalho", (req, res) => {
    const { item_doado, quantidade, data } = req.body;
    const usuario_id = req.session.usuario_id;
    const pontuacao_final = item_doado * quantidade;

    const query = `INSERT INTO doar_agasalho (item_doado, quantidade, data, pontuacao_final, usuario_id)
                   VALUES (?, ?, ?, ?, ?)`;
    db.run(query, [item_doado, quantidade, data, pontuacao_final, usuario_id], function (err) {
        if (err) throw err;
        res.redirect("/conclusao1");
    });
});

// DOAR BRINQUEDO
app.get("/doar/brinquedo", (req, res) => {
    if (!req.session.usuario_id) {
        return res.redirect("/login");
    }
    res.render("pages/doar_brinquedo", { req });
});
app.post("/doar/brinquedo", (req, res) => {
    const { item_doado, quantidade, data } = req.body;
    const usuario_id = req.session.usuario_id;
    const pontuacao_final = item_doado * quantidade;

    const query = `INSERT INTO doar_brinquedo (item_doado, quantidade, data, pontuacao_final, usuario_id)
                   VALUES (?, ?, ?, ?, ?)`;
    db.run(query, [item_doado, quantidade, data, pontuacao_final, usuario_id], function (err) {
        if (err) throw err;
        res.redirect("/conclusao2");
    });
});

// DOAR ALIMENTO
app.get("/doar/alimento", (req, res) => {
    if (!req.session.usuario_id) {
        return res.redirect("/login");
    }
    res.render("pages/doar_alimento", { req });
});
app.post("/doar/alimento", (req, res) => {
    const { item_doado, quantidade, data } = req.body;
    const usuario_id = req.session.usuario_id;
    const pontuacao_final = item_doado * quantidade;

    const query = `INSERT INTO doar_alimento (item_doado, quantidade, data, pontuacao_final, usuario_id)
                   VALUES (?, ?, ?, ?, ?)`;
    db.run(query, [item_doado, quantidade, data, pontuacao_final, usuario_id], function (err) {
        if (err) throw err;
        res.redirect("/conclusao3");
    });
});

// DOAR RAÇÃO
app.get("/doar/racao", (req, res) => {
    if (!req.session.usuario_id) {
        return res.redirect("/login");
    }
    res.render("pages/doar_racao", { req });
});
app.post("/doar/racao", (req, res) => {
    const { item_doado, quantidade, data } = req.body;
    const usuario_id = req.session.usuario_id;
    const pontuacao_final = item_doado * quantidade;

    const query = `INSERT INTO doar_racao (item_doado, quantidade, data, pontuacao_final, usuario_id)
                   VALUES (?, ?, ?, ?, ?)`;
    db.run(query, [item_doado, quantidade, data, pontuacao_final, usuario_id], function (err) {
        if (err) throw err;
        res.redirect("/conclusao4");
    });
});

app.get("/conclusa1", (req, res) => {
    console.log("GET /conclusao1")
    res.render("pages/conclusao1");
})
app.get("/conclusao2", (req, res) => {
    console.log("GET /conclusao2")
    res.render("pages/conclusao2");
})
app.get("/conclusao3", (req, res) => {
    console.log("GET /conclusao3")
    res.render("pages/conclusao2");
})

// RANKING 1 - AGASALHO
app.get("/ranking1", (req, res) => {
    console.log("GET /ranking1");
    const query = `
        SELECT usuario_id,
               SUM(item_doado * quantidade) AS pontuacao_total,
               SUM(quantidade) AS total_itens,
               MAX(data) AS ultima_data
        FROM doar_agasalho
        GROUP BY usuario_id
        ORDER BY pontuacao_total DESC
    `;
    db.all(query, [], (err, row) => {
        if (err) throw err;
        console.log(JSON.stringify(row));
        res.render("pages/ranking", { titulo: "Ranking Agasalho", dados: row, req });
    });
});

// RANKING 2 - BRINQUEDO
app.get("/ranking2", (req, res) => {
    console.log("GET /ranking2");
    const query = `
        SELECT usuario_id,
               SUM(item_doado * quantidade) AS pontuacao_total,
               SUM(quantidade) AS total_itens,
               MAX(data) AS ultima_data
        FROM doar_brinquedo
        GROUP BY usuario_id
        ORDER BY pontuacao_total DESC
    `;
    db.all(query, [], (err, row) => {
        if (err) throw err;
        console.log(JSON.stringify(row));
        res.render("pages/ranking", { titulo: "Ranking Brinquedo", dados: row, req });
    });
});

// RANKING 3 - ALIMENTO
app.get("/ranking3", (req, res) => {
    console.log("GET /ranking3");
    const query = `
        SELECT usuario_id,
               SUM(item_doado * quantidade) AS pontuacao_total,
               SUM(quantidade) AS total_itens,
               MAX(data) AS ultima_data
        FROM doar_alimento
        GROUP BY usuario_id
        ORDER BY pontuacao_total DESC
    `;
    db.all(query, [], (err, row) => {
        if (err) throw err;
        console.log(JSON.stringify(row));
        res.render("pages/ranking", { titulo: "Ranking Alimento", dados: row, req });
    });
});

// RANKING 4 - RAÇÃO
app.get("/ranking4", (req, res) => {
    console.log("GET /ranking4");
    const query = `
        SELECT usuario_id,
               SUM(item_doado * quantidade) AS pontuacao_total,
               SUM(quantidade) AS total_itens,
               MAX(data) AS ultima_data
        FROM doar_racao
        GROUP BY usuario_id
        ORDER BY pontuacao_total DESC
    `;
    db.all(query, [], (err, row) => {
        if (err) throw err;
        console.log(JSON.stringify(row));
        res.render("pages/ranking", { titulo: "Ranking Ração", dados: row, req });
    });
});

app.get("/info", (req, res) => {
    console.log("GET /info")
    res.render("pages/info");
})

app.get("/logout", (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.redirect("/");
        }
        res.redirect("/");
    });
})

app.use('/{*erro}', (req, res) => {
    //Envia uma resposta de erro 404
    res.status(404).render('pages/erro', { titulo: "ERRO 404", req: req, msg: "404" });
});

app.listen(PORT, () => {
    console.log(`Servidor sendo executado na porta ${PORT}`);
    console.log(__dirname + "/static");
});