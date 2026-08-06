var express = require('express');
var router = express.Router();
const db = require('../../db'); // Importação do banco de dados
const bcrypt = require('bcrypt'); // Algoritmo de criptografia
const crypto = require('crypto'); // Gera tokens aleatórios
const sendEmail = require('../../config/email'); // Manda email para usuário
const { templateCodigoRecuperacao } = require('../../config/emailTemplates');

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('loja/index', { title: 'RP Celulares - Home' });
});

router.get('/carrinho', function(req, res, next) {
  res.render('loja/carrinho', { title: 'Você está no Carrinho' });
});

router.get('/recuperar-senha', function(req, res) {
  res.render('loja/recuperar-senha', {
    title: 'Você está em Recuperar Senha',
    erro: null,
    sucesso: null
  });
});

router.get('/cadastro', function(req, res, next) {
  res.render('loja/cadastro', {
    title: 'Você está no Cadastro',
    erro: null
  });
});

router.get('/login', function(req, res) {
  const mensagemUrl = req.query.mensagem;
  res.render('loja/login', {
    title: 'Login',
    erro: null,
    mensagem: mensagemUrl
  });
});

/* POST cadastro de cliente */
router.post('/cadastro', async (req, res) => {

  const {
    nome,
    telefone,
    email,
    senha,
    confirmarSenha,
    dia,
    mes,
    ano
  } = req.body;

  try {

    // Remove espaços e valida campos básicos
    if (!nome || !telefone || !email || !senha || !confirmarSenha) {
      return res.render('loja/cadastro', {
        title: 'Você está no Cadastro',
        erro: 'Preencha todos os campos.'
      });
    }

    const emailLimpo = email.trim();
    const telefoneLimpo = telefone.trim();

    // Senhas iguais
    if (senha !== confirmarSenha) {
      return res.render('loja/cadastro', {
        title: 'Você está no Cadastro',
        erro: 'As senhas não coincidem.'
      });
    }

    // Data nascimento
    const dataNascimento =
      `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;

    // Verifica e-mail existente (mais leve que SELECT *)
    const [emailExistente] = await db.query(
      'SELECT 1 FROM cliente WHERE email = ? LIMIT 1',
      [emailLimpo]
    );

    if (emailExistente.length > 0) {
      return res.render('loja/cadastro', {
        title: 'Você está no Cadastro',
        erro: 'Este e-mail já está cadastrado.'
      });
    }

    // Verifica telefone existente
    const [telefoneExistente] = await db.query(
      'SELECT 1 FROM cliente WHERE telefone = ? LIMIT 1',
      [telefoneLimpo]
    );

    if (telefoneExistente.length > 0) {
      return res.render('loja/cadastro', {
        title: 'Você está no Cadastro',
        erro: 'Este telefone já está cadastrado.'
      });
    }

    // Hash senha
    const hashSenha = await bcrypt.hash(senha, 12);

    // Salva no banco de dados
    const [resultado] = await db.query(
      `
      INSERT INTO cliente
      (nome, telefone, email, senha, data_nasc)
      VALUES (?, ?, ?, ?, ?)
      `,
      [nome.trim(), telefoneLimpo, emailLimpo, hashSenha, dataNascimento]
    );

    // Login automático 
    req.session.clienteLogado = {
      id_cliente: resultado.insertId,
      nome,
      email: emailLimpo,
      telefone: telefoneLimpo
    };

    return res.redirect('/');

  } catch (err) {
    console.error(err);
    return res.status(500).send('Erro ao cadastrar usuário.');
  }
});


/* Rota de Login (funcionario e usuário) */
router.post('/login', async (req, res) => {

  const { usuario, senha } = req.body;

  try {

    if (!usuario || !senha) {
      return res.render('loja/login', {
        title: 'Login',
        erro: 'Preencha todos os campos.',
        mensagem: null
      });
    }

    const usuarioLimpo = usuario.trim();

    // 1 - TENTA LOGIN DO CLIENTE

    const [clientes] = await db.query(
      `
      SELECT id_cliente, nome, email, telefone, senha
      FROM cliente
      WHERE email = ?
      OR telefone = ?
      LIMIT 1
      `,
      [usuarioLimpo, usuarioLimpo]
    );

    if (clientes.length > 0) {

      const cliente = clientes[0];

      const senhaCorreta = await bcrypt.compare(
        senha,
        cliente.senha
      );

      if (senhaCorreta) {

        req.session.clienteLogado = {
          id_cliente: cliente.id_cliente,
          nome: cliente.nome,
          email: cliente.email,
          telefone: cliente.telefone
        };

        return res.redirect('/');
      }

    }

    // 2 - TENTA LOGIN DO FUNCIONÁRIO

    const [funcionarios] = await db.query(
      `
      SELECT *
      FROM funcionario
      WHERE nome_usuario = ?
      LIMIT 1
      `,
      [usuarioLimpo]
    );

    if (funcionarios.length > 0) {

      const funcionario = funcionarios[0];

      // Verifica a senha com bcrypt (hash)
      const senhaAdminCorreta = await bcrypt.compare(senha, funcionario.senha);

      if (senhaAdminCorreta) {

        req.session.usuarioLogado = funcionario;

        return res.redirect('/admin');
      }
    }

    return res.render('loja/login', {
      title: 'Login',
      erro: 'Usuário ou senha inválidos!',
      mensagem: null
    });

  } catch (err) {

    console.error(err);

    return res.status(500).send('Erro interno no servidor');

  }

});


// Rota para deslogar do sistema
router.get('/logout', (req, res) => {
    // Destrói a sessão do usuário no servidor
    req.session.destroy((err) => {
        if (err) {
            console.log("Erro ao sair:", err);
            return res.redirect('/admin'); // Se der erro mantém no admin
        }
        res.clearCookie('connect.sid'); 
        // Redireciona para a home da loja online
        res.redirect('/');
    });
});

/* Verificação - Cliente Logado (ao apertar aba "Sua Conta" no menu) */
function verificarLoginCliente(req, res, next) {
    if (req.session.clienteLogado) {
        return next();
    }
    // Se não estiver logado redireciona para o login com uma mensagem
    res.redirect('/login?mensagem=precisa_login');
}



/* ------ Processo de Recuperar Senha ----- */
const rateLimit = require('express-rate-limit');

// Limita pedidos de código (no máx. 5 por IP a cada 15 minutos)
const limiteRecuperacao = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.'
});

/* GET - tela inicial de recuperação */
router.get('/recuperar-senha', (req, res) => {
  res.render('loja/recuperar-senha', { erro: null, sucesso: null });
});

/* POST - gerar e enviar código por e-mail */
router.post('/recuperar-senha', limiteRecuperacao, async (req, res) => {
  const { email } = req.body;

  try {
    const [clientes] = await db.query(
      'SELECT id_cliente FROM cliente WHERE email = ?',
      [email]
    );

    const mensagemPadrao = 'Se este e-mail estiver cadastrado, enviamos um código de verificação.';

    if (clientes.length === 0) {
      return res.render('loja/recuperar-senha', { erro: null, sucesso: mensagemPadrao });
    }

    const cliente = clientes[0];

    const codigo = crypto.randomInt(100000, 999999).toString();
    const codigoHash = await bcrypt.hash(codigo, 12);

    const expiracao = new Date();
    expiracao.setMinutes(expiracao.getMinutes() + 10);

    await db.query(
      `UPDATE cliente
       SET codigo_recuperacao = ?, expiracao_codigo = ?, tentativas_codigo = 0
       WHERE id_cliente = ?`,
      [codigoHash, expiracao, cliente.id_cliente]
    );

    await sendEmail(
      email,
        'Código de recuperação de senha - RP Celulares',
        `Seu código de verificação é: ${codigo}\n\nEste código expira em 10 minutos.\nSe você não solicitou isso, ignore este e-mail.`,
    templateCodigoRecuperacao(codigo)
    );

    req.session.resetClienteId = cliente.id_cliente;
    req.session.resetVerificado = false;

    return res.redirect('/verificar-codigo');

  } catch (err) {
    console.error(err);
    res.status(500).send('Erro no servidor');
  }
});

/* GET - tela de digitar o código */
router.get('/verificar-codigo', (req, res) => {
  if (!req.session.resetClienteId) {
    return res.redirect('/recuperar-senha');
  }
  res.render('loja/verificar-codigo', { erro: null });
});

/* POST - validar código digitado */
router.post('/verificar-codigo', async (req, res) => {
  const { codigo } = req.body;
  const clienteId = req.session.resetClienteId;

  if (!clienteId) {
    return res.redirect('/recuperar-senha');
  }

  try {
    const [clientes] = await db.query(
      'SELECT * FROM cliente WHERE id_cliente = ?',
      [clienteId]
    );
    const cliente = clientes[0];

    if (!cliente.codigo_recuperacao || new Date() > new Date(cliente.expiracao_codigo)) {
      req.session.resetClienteId = null;
      return res.render('loja/verificar-codigo', { erro: 'Código expirado. Solicite um novo.' });
    }

    if (cliente.tentativas_codigo >= 5) {
      await db.query(
        `UPDATE cliente
         SET codigo_recuperacao = NULL, expiracao_codigo = NULL, tentativas_codigo = 0
         WHERE id_cliente = ?`,
        [clienteId]
      );
      req.session.resetClienteId = null;
      return res.render('loja/verificar-codigo', { erro: 'Muitas tentativas incorretas. Solicite um novo código.' });
    }

    const codigoValido = await bcrypt.compare(codigo, cliente.codigo_recuperacao);

    if (!codigoValido) {
      await db.query(
        'UPDATE cliente SET tentativas_codigo = tentativas_codigo + 1 WHERE id_cliente = ?',
        [clienteId]
      );
      return res.render('loja/verificar-codigo', { erro: 'Código incorreto. Tente novamente.' });
    }

    req.session.resetVerificado = true;
    return res.redirect('/nova-senha');

  } catch (err) {
    console.error(err);
    res.status(500).send('Erro no servidor');
  }
});

/* GET - tela de nova senha */
router.get('/nova-senha', (req, res) => {
  if (!req.session.resetClienteId || !req.session.resetVerificado) {
    return res.redirect('/recuperar-senha');
  }
  res.render('loja/nova-senha', { erro: null });
});

/* POST - salvar nova senha */
router.post('/nova-senha', async (req, res) => {
  const { senha, confirmarSenha } = req.body;
  const clienteId = req.session.resetClienteId;

  if (!clienteId || !req.session.resetVerificado) {
    return res.redirect('/recuperar-senha');
  }

  if (senha !== confirmarSenha) {
    return res.render('loja/nova-senha', { erro: 'As senhas não conferem.' });
  }

  if (senha.length < 8) {
    return res.render('loja/nova-senha', { erro: 'A senha precisa ter no mínimo 8 caracteres.' });
  }

  try {
    const hash = await bcrypt.hash(senha, 12);

    await db.query(
      `UPDATE cliente
       SET senha = ?, codigo_recuperacao = NULL, expiracao_codigo = NULL, tentativas_codigo = 0
       WHERE id_cliente = ?`,
      [hash, clienteId]
    );

    req.session.resetClienteId = null;
    req.session.resetVerificado = null;

    res.redirect('/login?mensagem=senha_atualizada');

  } catch (err) {
    console.error(err);
    res.status(500).send('Erro no servidor');
  }
});

module.exports = router;