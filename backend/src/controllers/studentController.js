export function criarControladorDeAlunos({ studentService: servicoDeAlunos }) {
  return {
    async listarEscolas(_requisicao, resposta, proximo) {
      try {
        resposta.json({ schools: await servicoDeAlunos.listarEscolas() });
      } catch (erro) {
        proximo(erro);
      }
    },

    async criar(requisicao, resposta, proximo) {
      try {
        const aluno = await servicoDeAlunos.criarAluno(requisicao.body);
        resposta.status(201).json({ student: aluno });
      } catch (erro) {
        proximo(erro);
      }
    },
  };
}
