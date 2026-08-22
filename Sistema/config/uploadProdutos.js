const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, '..', 'public', 'images', 'produtos'));
  },
  filename: function (req, file, cb) {
    // Nome único: timestamp + extensão original (evita nomes repetidos sobrescreverem uns aos outros)
    const nomeUnico = Date.now() + path.extname(file.originalname);
    cb(null, nomeUnico);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // limite de 5MB por imagem
  fileFilter: function (req, file, cb) {
    const tiposPermitidos = /jpeg|jpg|png|webp/;
    const extensaoValida = tiposPermitidos.test(path.extname(file.originalname).toLowerCase());

    if (extensaoValida) {
      cb(null, true);
    } else {
      cb(new Error('Formato de imagem não suportado. Use JPG, PNG ou WEBP.'));
    }
  }
});

module.exports = upload;