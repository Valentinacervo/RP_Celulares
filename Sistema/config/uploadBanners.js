const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, '..', 'public', 'images', 'banners'));
  },
  filename: function (req, file, cb) {
    const nomeUnico = Date.now() + path.extname(file.originalname);
    cb(null, nomeUnico);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: function (req, file, cb) {
    const tiposPermitidos = /jpeg|jpg|png|webp|gif/;
    const extensaoValida = tiposPermitidos.test(path.extname(file.originalname).toLowerCase());
    if (extensaoValida) {
      cb(null, true);
    } else {
      cb(new Error('Formato de imagem não suportado. Use JPG, PNG ou WEBP.'));
    }
  }
});

module.exports = upload;