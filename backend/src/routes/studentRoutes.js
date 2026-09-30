import express from 'express';
import { criarControladorDeAlunos } from '../controllers/studentController.js';
import { autenticarMotorista, criarVerificacaoDePapel } from '../middlewares/auth.js';
import { criarRepositorioDeAlunos } from '../repositories/studentRepository.js';
import { criarServicoDeAlunos } from '../services/studentService.js';

export function criarRoteadorDeAlunos({ pool: bancoDeDados }) {
  const repositorioDeAlunos = criarRepositorioDeAlunos(bancoDeDados);
  const servicoDeAlunos = criarServicoDeAlunos({ studentRepository: repositorioDeAlunos });
  const controlador = criarControladorDeAlunos({ studentService: servicoDeAlunos });
  const somenteAdministradores = criarVerificacaoDePapel(bancoDeDados, 'admin');
  const roteador = express.Router();

  roteador.get('/schools', autenticarMotorista, somenteAdministradores, controlador.listarEscolas);
  roteador.post('/students', autenticarMotorista, somenteAdministradores, controlador.criar);
  return roteador;
}

export default criarRoteadorDeAlunos;
