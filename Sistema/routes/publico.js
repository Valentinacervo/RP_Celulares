var express = require('express');
var router = express.Router();

router.get('/', function(req, res) {
  res.render('publico/index', { title: 'RP Celulares - Home/Conserto' });
});

router.get('/conserto', function(req, res) {
  res.render('publico/conserto', { title: 'Sobre Nós' });
});

module.exports = router;