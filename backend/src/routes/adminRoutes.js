import express from 'express';
import { criarControladorAdministrativo } from '../controllers/adminController.js';
import { autenticarMotorista, criarVerificacaoDePapel } from '../middlewares/auth.js';
import { criarRepositorioAdministrativo } from '../repositories/adminRepository.js';
import { criarServicoAdministrativo } from '../services/adminService.js';

export function criarRoteadorAdministrativo({ pool: bancoDeDados }) {
  const repositorioAdministrativo = criarRepositorioAdministrativo(bancoDeDados);
  const servicoAdministrativo = criarServicoAdministrativo({ adminRepository: repositorioAdministrativo });
  const controlador = criarControladorAdministrativo({ adminService: servicoAdministrativo });
  const somenteAdministradores = criarVerificacaoDePapel(bancoDeDados, 'admin');
  const roteador = express.Router();

  roteador.get('/users', autenticarMotorista, somenteAdministradores, controlador.listarUsuarios);
  roteador.patch('/users/:id/permissions', autenticarMotorista, somenteAdministradores, controlador.atualizarPermissoes);
  return roteador;
}

export default criarRoteadorAdministrativo;
