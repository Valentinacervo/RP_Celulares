// Opções usadas nas listas (select) do cadastro de conserto.
// Para adicionar/remover uma opção, é só editar aqui.

const tiposAparelho = [
  'Celular', 'Tablet', 'Notebook', 'Computador',
  'Smartwatch', 'Console de videogame', 'Fone de ouvido', 'Outro'
];

const marcas = [
  'Apple', 'Samsung', 'Motorola', 'Xiaomi', 'LG', 'Asus', 'Dell',
  'Lenovo', 'Acer', 'HP', 'Positivo', 'Multilaser', 'Outra'
];

const servicos = [
  'Troca de tela', 'Troca de bateria', 'Troca de conector de carga',
  'Troca de câmera', 'Troca de alto-falante / microfone', 'Reparo de placa',
  'Formatação / Software', 'Limpeza interna', 'Diagnóstico', 'Outro'
];

const formasPagamento = ['Dinheiro', 'Pix', 'Cartão - débito', 'Cartão - crédito'];

const garantias = [
  { valor: 0,   rotulo: 'Sem garantia' },
  { valor: 30,  rotulo: '30 dias' },
  { valor: 60,  rotulo: '60 dias' },
  { valor: 90,  rotulo: '90 dias' },
  { valor: 180, rotulo: '180 dias' },
  { valor: 365, rotulo: '1 ano' }
];

module.exports = { tiposAparelho, marcas, servicos, formasPagamento, garantias };