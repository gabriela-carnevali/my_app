import { converterCoordenada, validarLadoDireitoDaCalcada } from './geoUtils.js';

const PADRAO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function criarErroDeRequisicaoInvalida(mensagem) {
  const erro = new Error(mensagem);
  erro.statusCode = 400;
  return erro;
}

export function criarServicoDeAlunos({ studentRepository: repositorioDeAlunos }) {
  return {
    listarEscolas() {
      return repositorioDeAlunos.listarEscolas();
    },

    async criarAluno(dadosDoAluno) {
      if (!dadosDoAluno || typeof dadosDoAluno !== 'object') throw criarErroDeRequisicaoInvalida('Dados do aluno inválidos.');
      if (typeof dadosDoAluno.schoolId !== 'string' || !PADRAO_UUID.test(dadosDoAluno.schoolId)) throw criarErroDeRequisicaoInvalida('Selecione uma escola válida.');
      const nomeDoAluno = typeof dadosDoAluno.name === 'string' ? dadosDoAluno.name.trim() : '';
      if (nomeDoAluno.length < 2 || nomeDoAluno.length > 160) throw criarErroDeRequisicaoInvalida('O nome precisa ter entre 2 e 160 caracteres.');
      const enderecoDaFoto = dadosDoAluno.photoUrl == null || dadosDoAluno.photoUrl === '' ? null : String(dadosDoAluno.photoUrl).trim();
      if (enderecoDaFoto && enderecoDaFoto.length > 2048) throw criarErroDeRequisicaoInvalida('O endereço da foto é muito longo.');
      const logradouro = typeof dadosDoAluno.street === 'string' ? dadosDoAluno.street.trim() : '';
      const numeroDoImovel = typeof dadosDoAluno.number === 'string' ? dadosDoAluno.number.trim() : '';
      const complemento = typeof dadosDoAluno.complement === 'string' ? dadosDoAluno.complement.trim() : '';
      if (!logradouro || logradouro.length > 200 || numeroDoImovel.length > 30 || complemento.length > 200) {
        throw criarErroDeRequisicaoInvalida('Informe o logradouro e confira os limites do endereço.');
      }

      let coordenadasDaFachada;
      let coordenadasDoInicioDaRua;
      let coordenadasDoFimDaRua;
      try {
        coordenadasDaFachada = converterCoordenada(dadosDoAluno.facadeCoordinates, 'fachada');
        coordenadasDoInicioDaRua = converterCoordenada(dadosDoAluno.roadStartCoordinates, 'início do trecho da rua');
        coordenadasDoFimDaRua = converterCoordenada(dadosDoAluno.roadEndCoordinates, 'fim do trecho da rua');
      } catch (erro) {
        throw criarErroDeRequisicaoInvalida(erro.message);
      }
      const validacaoDaCalcada = validarLadoDireitoDaCalcada({
        roadStart: coordenadasDoInicioDaRua,
        roadEnd: coordenadasDoFimDaRua,
        facade: coordenadasDaFachada,
      });
      if (!validacaoDaCalcada.valid) {
        throw criarErroDeRequisicaoInvalida('A fachada não está no lado direito do trecho orientado. Confira as coordenadas da rua.');
      }
      if (!(await repositorioDeAlunos.escolaExiste(dadosDoAluno.schoolId))) throw criarErroDeRequisicaoInvalida('A escola selecionada não existe.');

      return repositorioDeAlunos.criarAlunoComEndereco({
        schoolId: dadosDoAluno.schoolId,
        name: nomeDoAluno,
        photoUrl: enderecoDaFoto,
        street: logradouro,
        number: numeroDoImovel,
        complement: complemento,
        facadeCoordinates: coordenadasDaFachada,
        roadStartCoordinates: coordenadasDoInicioDaRua,
        roadEndCoordinates: coordenadasDoFimDaRua,
      });
    },
  };
}
