var express = require('express');
var router = express.Router();
const db = require('../../db');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');
const upload = require('../../config/uploadProdutos');
const uploadBanner = require('../../config/uploadBanners');

// Middleware de proteção
function verificarAutenticacao(req, res, next) {
  if (req.session.usuarioLogado) {
    return next();
  }
  res.redirect('/login');
}

router.use(verificarAutenticacao);

/* TELA INICIAL - PRODUTOS */

/* GET tela inicial de produtos */
router.get('/', async (req, res, next) => {
  try {
    const categoriaId = req.query.categoria || null;

    const [categorias] = await db.query('SELECT * FROM categoria ORDER BY nome');
    const [banners] = await db.query('SELECT * FROM banner ORDER BY ordem ASC');

    let query = 'SELECT * FROM produto WHERE ativo = 1';
    const params = [];

    if (categoriaId) {
      query += ' AND id_categoria = ?';
      params.push(categoriaId);
    }

    query += categoriaId ? ' ORDER BY nome' : ' ORDER BY vendas DESC LIMIT 12';

    const [produtos] = await db.query(query, params);

    res.render('admin/produtos/produtosAdmin', {
      title: 'Produtos',
      usuario: req.session.usuarioLogado,
      categorias,
      produtos,
      banners,
      paginaAtual: 'inicio',
      categoriaSelecionada: categoriaId,
      erroExcluirCategoria: req.query.erroExcluirCategoria || null
    });

  } catch (err) {
    next(err);
  }
});


/* PRODUTO */

/* GET formulário de adicionar produto */
router.get('/adicionar', async (req, res, next) => {
  try {
    const [categorias] = await db.query('SELECT * FROM categoria ORDER BY nome');

    res.render('admin/produtos/adicionarProdutos', {
      title: 'Adicionar produto',
      usuario: req.session.usuarioLogado,
      categorias,
      paginaAtual: 'adicionar-produto',
      categoriaSelecionada: null,
      erro: null
    });

  } catch (err) {
    next(err);
  }
});

/* POST salvar novo produto */
router.post('/adicionar', upload.single('foto'), async (req, res, next) => {
  try {
    const {
      nome, descricao, preco, preco_original,
      parcelas, estoque,
      medidas, material, id_categoria, marca, garantia_meses
    } = req.body;

    if (!req.file) {
      const [categorias] = await db.query('SELECT * FROM categoria ORDER BY nome');

      return res.render('admin/produtos/adicionarProdutos', {
        title: 'Adicionar produto',
        usuario: req.session.usuarioLogado,
        categorias,
        paginaAtual: 'adicionar-produto',
        categoriaSelecionada: null,
        erro: 'Selecione uma foto para o produto.'
      });
    }

    const nomeArquivo = req.file.filename;

    await db.query(
      `INSERT INTO produto
       (nome, descricao, foto, preco, preco_original, parcelas,
        estoque, medidas, material, id_categoria, marca, garantia_meses)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        nome, descricao || null, nomeArquivo, preco,
        preco_original || null, parcelas || 1,
        estoque, medidas || null, material,
        id_categoria, marca, garantia_meses || null
      ]
    );

    res.redirect('/admin/produtos');

  } catch (err) {
    next(err);
  }
});


/* CATEGORIA */

/* POST salvar nova categoria */
router.post('/categorias/adicionar', async (req, res, next) => {
  try {
    const { nome } = req.body;

    if (!nome || nome.trim() === '') {
      req.session.erroCategoria = 'Digite o nome da categoria.';
      return res.redirect('back');
    }

    await db.query(
      'INSERT INTO categoria (nome) VALUES (?)',
      [nome.trim()]
    );

    res.redirect('/admin/produtos');

  } catch (err) {
    next(err);
  }
});

/* POST confirmar exclusão de categoria (com senha) */
router.post('/categorias/:id/excluir', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { senha } = req.body;

    const funcionario = req.session.usuarioLogado;
    const senhaCorreta = await bcrypt.compare(senha || '', funcionario.senha);

    if (!senhaCorreta) {
      return res.redirect('/admin/produtos?erroExcluirCategoria=Senha incorreta.');
    }

    // Desativa os produtos relacionados (em vez de apagar)
    await db.query('UPDATE produto SET ativo = 0 WHERE id_categoria = ?', [id]);

    await db.query('DELETE FROM categoria WHERE id_categoria = ?', [id]);

    res.redirect('/admin/produtos');

  } catch (err) {
    next(err);
  }
});

/* BANNER */

/* POST adicionar banner */
router.post('/banners/adicionar', uploadBanner.single('imagem'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.redirect('/admin/produtos');
    }

    const [ultimo] = await db.query('SELECT MAX(ordem) AS maiorOrdem FROM banner');
    const proximaOrdem = (ultimo[0].maiorOrdem || 0) + 1;

    await db.query(
      'INSERT INTO banner (imagem, ordem) VALUES (?, ?)',
      [req.file.filename, proximaOrdem]
    );

    res.redirect('/admin/produtos');

  } catch (err) {
    next(err);
  }
});

/* POST excluir banner */
router.post('/banners/:id/excluir', async (req, res, next) => {
  try {
    const { id } = req.params;

    // Busca o nome do arquivo antes de apagar o registro do banco
    const [bannerEncontrado] = await db.query(
      'SELECT imagem FROM banner WHERE id_banner = ?',
      [id]
    );

    if (bannerEncontrado.length > 0) {
      const nomeArquivo = bannerEncontrado[0].imagem;
      const caminhoArquivo = path.join(__dirname, '..', '..', 'public', 'images', 'banners', nomeArquivo);

      fs.unlink(caminhoArquivo, (err) => {
        if (err) {
          console.error('Não foi possível apagar o arquivo do banner:', err.message);
        }
      });
    }

    await db.query('DELETE FROM banner WHERE id_banner = ?', [id]);

    res.redirect('/admin/produtos');

  } catch (err) {
    next(err);
  }
});

module.exports = router;