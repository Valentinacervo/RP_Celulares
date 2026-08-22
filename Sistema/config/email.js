const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

async function sendEmail(to, subject, text, html) {
  return transporter.sendMail({
    from: `"RP Celulares" <${process.env.EMAIL_USER}>`,
    to: to,
    subject: subject,
    text: text, 
    html: html 
  });
}

module.exports = sendEmail;