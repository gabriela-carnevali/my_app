# Transporte Escolar

Aplicativo cross-platform em JavaScript: React Native com Expo no mobile, API Node.js/Express e PostgreSQL com PostGIS. O app foi organizado para operação offline do motorista, controle administrativo e cálculo de percursos para até 27 alunos.
Aplicativo cross-platform em JavaScript: React Native com Expo no mobile, API Node.js/Express e PostgreSQL com PostGIS. O app foi organizado para operação offline do motorista, controle administrativo e cálculo de percursos para até 27 alunos.

## Estrutura
## Estrutura

```text
backend/
  sql/migrations/                 # esquema PostGIS e limite transacional de 27 alunos
  sql/migrations/                 # esquema PostGIS e limite transacional de 27 alunos
  src/
    config/                       # pool PostgreSQL e constantes de negócio
    controllers/                  # adaptação HTTP
    middlewares/                  # JWT, autorização e rate limit
    repositories/                 # consultas PostgreSQL parametrizadas
    routes/                       # endpoints Express
    services/                     # autenticação, geometria, otimização e sincronização
    scripts/                      # configuração inicial de senhas
    app.js                        # composição Express
    server.js                     # inicialização e encerramento do servidor
    config/                       # pool PostgreSQL e constantes de negócio
    controllers/                  # adaptação HTTP
    middlewares/                  # JWT, autorização e rate limit
    repositories/                 # consultas PostgreSQL parametrizadas
    routes/                       # endpoints Express
    services/                     # autenticação, geometria, otimização e sincronização
    scripts/                      # configuração inicial de senhas
    app.js                        # composição Express
    server.js                     # inicialização e encerramento do servidor
mobile/
  App.js                          # provedores da aplicação
  app.config.js                   # configuração Expo e permissões nativas
  navigation/                     # navegação React Navigation
  screens/                        # login, rota, edição, aluno, admin e configurações
  context/                        # sessão e preferências visuais
  hooks/                          # GPS em segundo plano e fila SQLite
  components/                     # componentes acessíveis
```

O `package-lock.json` da raiz foi removido porque não existe um `package.json` correspondente. Os lockfiles dentro de `backend/` e `mobile/` são os que fixam dependências para `npm ci`. Pastas nativas `mobile/android/` e `mobile/ios/` são geradas pelo Expo e ignoradas pelo Git.

## O que o sistema faz

- **Login e autorização:** autentica motoristas e administradores com JWT HS256. O backend confirma que a conta continua ativa e que o papel não foi revogado. A área de permissões e o cadastro de alunos são exibidos somente para administradores, e a API também valida essa regra.
- **Rotas do motorista:** lista percursos ativos disponíveis ao usuário, mostra o mapa, posição GPS do aparelho, sequência de embarque, escola como destino final, distância/tempo/consumo estimados e status de cada aluno.
- **Edição do percurso:** motorista pode incluir ou retirar alunos apenas do próprio percurso da data corrente; o backend verifica isso transacionalmente. Administradores podem editar rotas ativas. A alteração recalcula sequência e métricas.
- **Presença offline:** status e pontos GPS entram numa fila SQLite e são enviados quando há conexão. IDs de evento e recibos no PostgreSQL tornam a reentrega idempotente. Registros já confirmados são removidos do SQLite para evitar crescimento indefinido da fila.
- **GPS em segundo plano:** `expo-location` e `expo-task-manager` registram pontos enquanto o serviço está ativo. No Android, o app exibe a notificação do serviço em primeiro plano.
- **Acessibilidade:** há tema do sistema, claro ou escuro, alto contraste, texto ampliado e narração das paradas em português.
- **Limite de capacidade:** uma rota admite no máximo 27 alunos. A interface, serviços do backend e gatilho transacional da migração 004 aplicam o mesmo limite, inclusive em gravações concorrentes.

### Escopo existente e itens ainda não implementados

O repositório não tem telas/endpoints de criação de escolas, veículos, motoristas, responsáveis ou rotas, nem endpoints para remover uma rota concluída ou descadastrar/excluir um aluno. O cadastro de aluno existente exige escola, motorista responsável e endereço validados previamente. Para uma instalação nova, esses dados iniciais precisam ser provisionados no PostgreSQL por um processo administrativo confiável; sem uma rota e um usuário associados, o motorista poderá entrar, mas não terá percurso para abrir. Não cadastre credenciais padrão em SQL.

O fluxo de navegação exibe o traçado do percurso e a localização atual do próprio aparelho; não é um navegador curva a curva e não transmite a posição em tempo real para um painel web. A fala lê a sequência de paradas, mas não interpreta instruções de manobra. O motorista continua responsável por seguir as regras de trânsito e conferir o local de embarque.

## Roteamento e segurança pela calçada

`backend/src/services/routeOptimizer.js` recebe a posição da van, escola e alunos. A primeira parada é fixada no aluno alcançável com menor distância viária a partir da van. A última parada de aluno é fixada no aluno restante com menor distância viária direta até a escola. A escola permanece o destino absoluto. Entre essas âncoras, o algoritmo minimiza a soma das distâncias da matriz do Mapbox e usa duração como critério de desempate. Até 10 alunos a busca é exata; de 11 a 27, é usada inserção de paradas com busca local, que é uma heurística e não garante o ótimo global.

As coordenadas enviadas ao Mapbox usam `approaches=curb`. Antes de calcular, o backend exige que a fachada tenha um trecho de via orientado e valide o produto vetorial estritamente `D < 0` para o lado direito. Essa validação matemática depende da qualidade e da orientação das coordenadas fornecidas; `approaches=curb` não é uma garantia física de que o motorista consiga parar com segurança em qualquer cenário real. A [Optimization API](https://docs.mapbox.com/api/navigation/optimization-v1/) e a [Matrix API](https://docs.mapbox.com/api/navigation/matrix/) têm limites de coordenadas; por isso o sistema usa a Trip API apenas como referência para rotas curtas e divide a matriz/traçado em blocos para percursos maiores. A ordem aplicada vem do otimizador local sobre a matriz, não da sequência de referência da Trip API. O consumo exibido é uma estimativa `distância ÷ km/l` cadastrado; não modela marcha lenta, carga, aclives nem consumo medido no veículo.

É necessário um token válido do Mapbox no backend para recalcular distâncias e gerar geometrias. A chave Android do Google Maps é opcional para compilar, mas é necessária para carregar os tiles do mapa no dispositivo.

## API disponível

Todos os endpoints abaixo, exceto `/health` e `/api/auth/login`, exigem `Authorization: Bearer <JWT>` conforme o papel e a rota.

- `GET /health` — estado básico da API.
- `POST /api/auth/login` — `{ "email", "password" }`; retorna token com expiração de 8 horas.
- `GET /api/auth/me` — perfil atual.
- `GET /api/routes` e `GET /api/routes/:id` — lista e consulta de percursos autorizados.
- `GET /api/routes/:id/candidates` e `PUT /api/routes/:id/stops` — candidatos e substituição das paradas com recálculo.
- `GET /api/schools` e `POST /api/students` — consulta de escolas e cadastro de aluno, somente admin.
- `GET /api/admin/users` e `PATCH /api/admin/users/:id/permissions` — administração de usuários.
- `POST /api/sync/events` — lote de até 500 eventos de presença/GPS do motorista.
  App.js                          # provedores da aplicação
  app.config.js                   # configuração Expo e permissões nativas
  navigation/                     # navegação React Navigation
  screens/                        # login, rota, edição, aluno, admin e configurações
  context/                        # sessão e preferências visuais
  hooks/                          # GPS em segundo plano e fila SQLite
  components/                     # componentes acessíveis
```

O `package-lock.json` da raiz foi removido porque não existe um `package.json` correspondente. Os lockfiles dentro de `backend/` e `mobile/` são os que fixam dependências para `npm ci`. Pastas nativas `mobile/android/` e `mobile/ios/` são geradas pelo Expo e ignoradas pelo Git.

## O que o sistema faz

- **Login e autorização:** autentica motoristas e administradores com JWT HS256. O backend confirma que a conta continua ativa e que o papel não foi revogado. A área de permissões e o cadastro de alunos são exibidos somente para administradores, e a API também valida essa regra.
- **Rotas do motorista:** lista percursos ativos disponíveis ao usuário, mostra o mapa, posição GPS do aparelho, sequência de embarque, escola como destino final, distância/tempo/consumo estimados e status de cada aluno.
- **Edição do percurso:** motorista pode incluir ou retirar alunos apenas do próprio percurso da data corrente; o backend verifica isso transacionalmente. Administradores podem editar rotas ativas. A alteração recalcula sequência e métricas.
- **Presença offline:** status e pontos GPS entram numa fila SQLite e são enviados quando há conexão. IDs de evento e recibos no PostgreSQL tornam a reentrega idempotente. Registros já confirmados são removidos do SQLite para evitar crescimento indefinido da fila.
- **GPS em segundo plano:** `expo-location` e `expo-task-manager` registram pontos enquanto o serviço está ativo. No Android, o app exibe a notificação do serviço em primeiro plano.
- **Acessibilidade:** há tema do sistema, claro ou escuro, alto contraste, texto ampliado e narração das paradas em português.
- **Limite de capacidade:** uma rota admite no máximo 27 alunos. A interface, serviços do backend e gatilho transacional da migração 004 aplicam o mesmo limite, inclusive em gravações concorrentes.

### Escopo existente e itens ainda não implementados

O repositório não tem telas/endpoints de criação de escolas, veículos, motoristas, responsáveis ou rotas, nem endpoints para remover uma rota concluída ou descadastrar/excluir um aluno. O cadastro de aluno existente exige escola, motorista responsável e endereço validados previamente. Para uma instalação nova, esses dados iniciais precisam ser provisionados no PostgreSQL por um processo administrativo confiável; sem uma rota e um usuário associados, o motorista poderá entrar, mas não terá percurso para abrir. Não cadastre credenciais padrão em SQL.

O fluxo de navegação exibe o traçado do percurso e a localização atual do próprio aparelho; não é um navegador curva a curva e não transmite a posição em tempo real para um painel web. A fala lê a sequência de paradas, mas não interpreta instruções de manobra. O motorista continua responsável por seguir as regras de trânsito e conferir o local de embarque.

## Roteamento e segurança pela calçada

`backend/src/services/routeOptimizer.js` recebe a posição da van, escola e alunos. A primeira parada é fixada no aluno alcançável com menor distância viária a partir da van. A última parada de aluno é fixada no aluno restante com menor distância viária direta até a escola. A escola permanece o destino absoluto. Entre essas âncoras, o algoritmo minimiza a soma das distâncias da matriz do Mapbox e usa duração como critério de desempate. Até 10 alunos a busca é exata; de 11 a 27, é usada inserção de paradas com busca local, que é uma heurística e não garante o ótimo global.

As coordenadas enviadas ao Mapbox usam `approaches=curb`. Antes de calcular, o backend exige que a fachada tenha um trecho de via orientado e valide o produto vetorial estritamente `D < 0` para o lado direito. Essa validação matemática depende da qualidade e da orientação das coordenadas fornecidas; `approaches=curb` não é uma garantia física de que o motorista consiga parar com segurança em qualquer cenário real. A [Optimization API](https://docs.mapbox.com/api/navigation/optimization-v1/) e a [Matrix API](https://docs.mapbox.com/api/navigation/matrix/) têm limites de coordenadas; por isso o sistema usa a Trip API apenas como referência para rotas curtas e divide a matriz/traçado em blocos para percursos maiores. A ordem aplicada vem do otimizador local sobre a matriz, não da sequência de referência da Trip API. O consumo exibido é uma estimativa `distância ÷ km/l` cadastrado; não modela marcha lenta, carga, aclives nem consumo medido no veículo.

É necessário um token válido do Mapbox no backend para recalcular distâncias e gerar geometrias. A chave Android do Google Maps é opcional para compilar, mas é necessária para carregar os tiles do mapa no dispositivo.

## API disponível

Todos os endpoints abaixo, exceto `/health` e `/api/auth/login`, exigem `Authorization: Bearer <JWT>` conforme o papel e a rota.

- `GET /health` — estado básico da API.
- `POST /api/auth/login` — `{ "email", "password" }`; retorna token com expiração de 8 horas.
- `GET /api/auth/me` — perfil atual.
- `GET /api/routes` e `GET /api/routes/:id` — lista e consulta de percursos autorizados.
- `GET /api/routes/:id/candidates` e `PUT /api/routes/:id/stops` — candidatos e substituição das paradas com recálculo.
- `GET /api/schools` e `POST /api/students` — consulta de escolas e cadastro de aluno, somente admin.
- `GET /api/admin/users` e `PATCH /api/admin/users/:id/permissions` — administração de usuários.
- `POST /api/sync/events` — lote de até 500 eventos de presença/GPS do motorista.

## Instalação local no Windows

### 1. Instale as ferramentas

- Node.js 22.13 ou superior e npm.
- PostgreSQL e a versão do PostGIS compatível com essa instalação. A primeira migração habilita `postgis` e `pgcrypto`; os pacotes das extensões precisam estar instalados no servidor.
- Android Studio, Android SDK Platform 36, Android SDK Build-Tools 36 e Android NDK `27.1.12297006`.
- JDK 17. Configure o JDK 17 como **Gradle JDK** no Android Studio. A configuração de build validada neste projeto falha com JDK 25 na etapa CMake/Prefab.
- Um emulador Android ou um aparelho Android com depuração USB habilitada.

**Importante no Windows:** este checkout está numa pasta OneDrive com caminho longo. Aqui, o CMake excedeu o limite de caminho e o Metro não resolveu arquivos do React a partir da árvore em OneDrive. Use um clone/cópia do projeto em caminho local curto, por exemplo `C:\dev\transporte-escolar`, fora do OneDrive, e reinstale as dependências (`npm ci`) nessa cópia. Mapear com `subst` permitiu compilar o APK neste computador, mas não corrigiu o bundle do Metro.

Para copiar o checkout atual preservando o Git, mas sem transferir `.env`, dependências ou builds gerados, use uma pasta de destino nova:

```powershell
robocopy $PWD C:\dev\transporte-escolar /E /XD node_modules android ios .expo dist build /XF .env
if ($LASTEXITCODE -ge 8) { throw "Falha ao copiar o projeto: $LASTEXITCODE" }
Set-Location C:\dev\transporte-escolar
```

Crie novamente os arquivos `.env` locais a partir dos `.env.example` na cópia e reinstale as dependências dos dois projetos.

Confira as ferramentas no PowerShell:

```powershell
node --version
npm --version
psql --version
adb version
```

Se `psql` ou `adb` não forem encontrados, adicione ao `PATH` as pastas `bin` do PostgreSQL e `platform-tools` do Android SDK, ou use os caminhos completos. No Android Studio, abra **Tools > SDK Manager** e instale as plataformas, build tools e NDK indicados acima.

### 2. Crie o banco e aplique as migrações

No terminal do projeto, crie o banco (o comando pede a senha do usuário PostgreSQL):

```powershell
createdb -U postgres -W transporte_escolar
```

Execute as migrações em ordem e interrompa ao primeiro erro:

```powershell
Get-Content .\backend\sql\migrations\001_initial_schema.sql | psql -U postgres -W -d transporte_escolar -v ON_ERROR_STOP=1
Get-Content .\backend\sql\migrations\002_driver_auth.sql | psql -U postgres -W -d transporte_escolar -v ON_ERROR_STOP=1
Get-Content .\backend\sql\migrations\003_roles_and_route_day.sql | psql -U postgres -W -d transporte_escolar -v ON_ERROR_STOP=1
Get-Content .\backend\sql\migrations\004_route_stop_limit_27.sql | psql -U postgres -W -d transporte_escolar -v ON_ERROR_STOP=1
```

Confirme o PostGIS com `psql -U postgres -d transporte_escolar -c "SELECT PostGIS_Full_Version();"`. Se uma migração parar porque uma extensão não está disponível, instale o pacote PostGIS da mesma versão principal do PostgreSQL e repita a migração que falhou.

### 3. Configure e inicie o backend

Crie o arquivo local `.env` a partir do modelo (o `.gitignore` já o exclui):

```powershell
if (-not (Test-Path .\.env)) { Copy-Item .\.env.example .\.env }
```

Edite `.env` na raiz e ajuste `DATABASE_URL` para usuário, senha, host e nome do banco locais; mantenha `DATABASE_SSL=false` apenas em ambiente local. Gere um segredo JWT aleatório com pelo menos 32 bytes e cole em `JWT_SECRET`:

```powershell
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

Crie ou selecione um token ativo no [painel de tokens do Mapbox](https://console.mapbox.com/account/access-tokens/) com acesso às APIs Directions, Matrix e Optimization usadas pelo roteamento. Preencha `MAPBOX_ACCESS_TOKEN` somente no `.env` raiz; não o coloque em `EXPO_PUBLIC_*`, no código mobile ou no Git. Guarde o mesmo `JWT_SECRET` nas próximas inicializações; alterá-lo encerra as sessões existentes.

Instale as dependências e inicie a API:

```powershell
cd .\backend
cd .\backend
npm ci
npm run dev
```

Em outro PowerShell, verifique `http://localhost:3000/health`. Para o primeiro login, crie uma conta sem senha (senha será definida pelo utilitário interativo):

```powershell
psql -U postgres -d transporte_escolar -c "INSERT INTO motoristas (nome, email, role, ativo) VALUES ('Administrador local', 'admin@local.test', 'driver', true) ON CONFLICT (email) DO NOTHING;"
```

Depois, `npm run set-admin-password` pede o e-mail e a senha, e promove a conta a admin. Para cadastrar um motorista inicial, insira outra linha em `motoristas` com `role='driver'` e execute `npm run set-driver-password`. Ambos os utilitários exigem senha com pelo menos 12 caracteres.

Depois, importe ou cadastre no banco a escola, o veículo, os motoristas, os alunos/endereço e pelo menos uma rota/parada válidos. Esta preparação inicial ainda não tem uma tela de provisionamento. No endereço de cada aluno, `trecho_via` precisa ser uma linha orientada cuja fachada esteja à direita (`D < 0`).

### 4. Configure o mobile e o mapa

Em um novo terminal PowerShell:

```powershell
cd .\mobile
if (-not (Test-Path .\.env)) { Copy-Item .\.env.example .\.env }
```

Edite `mobile/.env`:

- Emulador Android: `EXPO_PUBLIC_API_URL=http://10.0.2.2:3000`.
- Aparelho físico: use o IPv4 do computador na rede local, por exemplo `http://192.168.0.20:3000`. O celular e o computador precisam estar na mesma rede. Se o Firewall do Windows bloquear a conexão, permita tráfego TCP de entrada na porta 3000 somente na rede privada.
- Para tiles no build Android nativo, crie uma chave no Google Cloud, habilite o Maps SDK for Android e restrinja a chave ao app Android `br.com.transporteescolar.app` (inclua o SHA-1 do certificado debug obtido por `mobile/android/gradlew.bat signingReport`) e somente ao Maps SDK for Android. Configure `GOOGLE_MAPS_ANDROID_API_KEY` em `mobile/.env`, rode `npx expo prebuild --platform android` e reconstrua o app. A chave entra no pacote nativo: restrições de app/API são obrigatórias; não a reutilize no backend.

Instale dependências e gere os arquivos nativos Android a partir da configuração Expo:

```powershell
npm ci
npx expo install --check
npx expo prebuild --platform android
```

### 5. Abra e rode no Android Studio

1. Inicie o Android Studio e selecione **Open**; escolha a pasta `mobile/android`.
2. Aguarde o Gradle sincronizar. Selecione JDK 17 em **File > Settings > Build, Execution, Deployment > Build Tools > Gradle > Gradle JDK**.
3. No **Device Manager**, crie/inicie um emulador API 36 ou conecte o aparelho por USB, habilite **Developer options > USB debugging** e confirme o diálogo de autorização no aparelho.
4. Confira o dispositivo com `adb devices`. Se aparecer `unauthorized`, aceite a autorização na tela do Android e execute o comando novamente.
5. No modo debug, mantenha o Metro ativo: em outro terminal, dentro de `mobile`, execute `npx expo start`. Depois selecione a configuração `app` no Android Studio e pressione **Run**. Também pode executar `npm run android` em `mobile`; esse comando faz o build/instalação e inicia o fluxo Expo. `.\gradlew.bat installDebug` apenas instala o APK debug e não inicia o Metro.
6. Entre com o e-mail e senha criados no backend. Abra uma rota ativa atribuída ao motorista; para editar, a rota deve ser do dia corrente se o usuário for motorista.
7. Ao iniciar o GPS, permita localização em primeiro plano e em segundo plano. O Android mantém uma notificação enquanto o serviço de localização está ativo.

Outra opção é executar `npm run android` dentro de `mobile`; o Expo chama o build nativo e instala o app no dispositivo/emulador selecionado. O rastreamento em segundo plano exige o build nativo; não funciona no Expo Go.
### 5. Abra e rode no Android Studio

1. Inicie o Android Studio e selecione **Open**; escolha a pasta `mobile/android`.
2. Aguarde o Gradle sincronizar. Selecione JDK 17 em **File > Settings > Build, Execution, Deployment > Build Tools > Gradle > Gradle JDK**.
3. No **Device Manager**, crie/inicie um emulador API 36 ou conecte o aparelho por USB, habilite **Developer options > USB debugging** e confirme o diálogo de autorização no aparelho.
4. Confira o dispositivo com `adb devices`. Se aparecer `unauthorized`, aceite a autorização na tela do Android e execute o comando novamente.
5. No modo debug, mantenha o Metro ativo: em outro terminal, dentro de `mobile`, execute `npx expo start`. Depois selecione a configuração `app` no Android Studio e pressione **Run**. Também pode executar `npm run android` em `mobile`; esse comando faz o build/instalação e inicia o fluxo Expo. `.\gradlew.bat installDebug` apenas instala o APK debug e não inicia o Metro.
6. Entre com o e-mail e senha criados no backend. Abra uma rota ativa atribuída ao motorista; para editar, a rota deve ser do dia corrente se o usuário for motorista.
7. Ao iniciar o GPS, permita localização em primeiro plano e em segundo plano. O Android mantém uma notificação enquanto o serviço de localização está ativo.

Outra opção é executar `npm run android` dentro de `mobile`; o Expo chama o build nativo e instala o app no dispositivo/emulador selecionado. O rastreamento em segundo plano exige o build nativo; não funciona no Expo Go.

## Configuração e segurança

- `.env` e `mobile/.env` guardam configurações locais e não devem ser versionados. Os arquivos `.env.example` são modelos sem segredos reais.
- O backend valida JWT, papel atual e vínculo do motorista com a rota. O segredo JWT é rejeitado se ausente ou menor que 32 bytes; senha é armazenada com scrypt.
- O limitador de login mantém no máximo 5.000 faixas por processo e permite cinco erros a cada 15 minutos. Ele é local à instância: em produção com vários servidores, use um limitador/armazenamento compartilhado e HTTPS.
- A API restringe o JSON a 1 MB, usa consultas SQL parametrizadas e não retorna mensagens internas de erro 5xx.
- O cache de rota agora é separado por usuário e o cache antigo, sem identificação de dono, é descartado na primeira abertura após a atualização. O app desativa backup Android porque o SQLite contém dados pessoais; o arquivo SQLite não usa criptografia SQLCipher, portanto não considere um aparelho com root/desbloqueado como armazenamento seguro.
- Nunca distribua chaves de desenvolvimento como credenciais de produção. Restrinja a chave do Google Maps ao app e mantenha o token Mapbox somente no servidor.

## Verificação da auditoria

Durante a revisão foram removidos o lockfile raiz sem manifesto, corrigido o retorno HTTP de JSON inválido/corpo grande, limitadas as entradas em memória do rate limiter, restringido o cache de rota por usuário, eliminados registros SQLite já confirmados e evitado usar uma posição GPS antiga como origem de recálculo. Eventos com horário mais de cinco minutos no futuro são recusados. O `.gitignore` cobre ambientes locais, dependências e builds nativos.

A auditoria atual (`npm audit`) retorna zero vulnerabilidades no backend e no mobile. O mobile fixa `glob` e `minimatch` em versões corrigidas por overrides de npm, sem rebaixar o Expo SDK 57. Execute `npm audit` novamente antes de publicar.
