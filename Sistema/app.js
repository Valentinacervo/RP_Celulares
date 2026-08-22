require('dotenv').config(); 

const session = require('express-session'); // validação de login para acessar sistema interno da loja
var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
const db = require('./db');


// --- ROTAS DA LOJA ONLINE ---
var lojaIndexRouter = require('./routes/loja/index');
var lojaConsertoRouter = require('./routes/loja/conserto');
var lojaSobreRouter = require('./routes/loja/sobre');
var lojaPerfilRouter = require('./routes/loja/perfil');

// --- ROTAS DO SISTEMA INTERNO (ADMIN) ---
var adminDashboardRouter = require('./routes/admin/dashboard');
var adminClientesRouter = require('./routes/admin/clientes');
var adminProdutosRouter = require('./routes/admin/produtos');


var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }))
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: process.env.SESSION_SECRET, // (Não esquecer: lê do .env)
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000
  }
}));

// --- CATEGORIAS DISPONÍVEIS (menu lateral dinâmico) ---
app.use(async (req, res, next) => {
  try {
    const [categorias] = await db.query('SELECT * FROM categoria ORDER BY nome');
    res.locals.categoriasMenu = categorias;
    next();
  } catch (err) {
    res.locals.categoriasMenu = [];
    next();
  }
});

// --- CONFIGURAÇÃO DAS URLs DA LOJA ---
app.use('/', lojaIndexRouter);
app.use('/conserto', lojaConsertoRouter);
app.use('/sobre', lojaSobreRouter);
app.use('/perfil', lojaPerfilRouter);

// --- CONFIGURAÇÃO DAS URLs DO ADMIN ---
app.use('/admin', adminDashboardRouter);
app.use('/admin/produtos', adminProdutosRouter);
app.use('/admin/clientes', adminClientesRouter);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;