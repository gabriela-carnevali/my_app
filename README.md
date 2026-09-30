# Transporte Escolar

Aplicativo cross-platform em JavaScript com Expo/React Native, API Node.js/Express e PostgreSQL/PostGIS.

## Estrutura do projeto

```text
backend/
  sql/migrations/001_initial_schema.sql
  src/
    config/database.js
    controllers/
    middlewares/auth.js
    repositories/
    routes/
    services/
    app.js
    server.js
mobile/
  App.js
  index.js
  context/AuthContext.js
  context/AppearanceContext.js
  components/AccessibleText.jsx
  navigation/AppNavigator.js
  screens/LoginScreen.jsx
  screens/HomeScreen.jsx
  screens/DriverRouteScreen.jsx
  screens/RouteEditorScreen.jsx
  screens/NewStudentScreen.jsx
  screens/AdminPermissionsScreen.jsx
  screens/SettingsScreen.jsx
  hooks/useBackgroundTracking.js
```

No backend, `app.js` configura o Express e monta as rotas; `server.js` inicia e encerra o servidor; controllers recebem as requisições; services concentram validações e regras de negócio; repositories acessam o PostgreSQL; e `config/` fornece o pool de conexões.

## Backend

Use Node.js 22.13 ou superior. Em um PostgreSQL com PostGIS, aplique em ordem `backend/sql/migrations/001_initial_schema.sql`, `002_driver_auth.sql` e `003_roles_and_route_day.sql`. A segunda e a terceira migrações atualizam instalações existentes. Na primeira execução, crie o `.env` somente se ele ainda não existir e preencha a conexão com o banco, o token Mapbox e um segredo JWT aleatório com pelo menos 32 bytes:

```powershell
cd backend
if (-not (Test-Path ..\.env)) { Copy-Item ..\.env.example ..\.env }
node --input-type=module -e "import { randomBytes } from 'node:crypto'; console.log(randomBytes(48).toString('base64url'))"
# Cole o segredo impresso em JWT_SECRET no arquivo ..\.env e preencha DATABASE_URL e MAPBOX_ACCESS_TOKEN.
npm ci
npm run set-driver-password
npm run dev
```

Os scripts do backend carregam automaticamente o `.env` da raiz do projeto. O `.gitignore` exclui os arquivos `.env` locais e mantém os modelos `.env.example` versionáveis. O arquivo raiz `.env` guarda configurações privadas do backend; `mobile/.env` guarda o endereço público da API e a chave Android opcional do Google Maps. Para o emulador Android, o endereço padrão é `http://10.0.2.2:3000`; em um aparelho físico, use o IP do computador na rede local. Não coloque o token secreto do Mapbox em uma variável `EXPO_PUBLIC_`.

`npm run set-driver-password` solicita o e-mail e a nova senha duas vezes no terminal; a senha precisa ter ao menos 12 caracteres e é armazenada com scrypt. O motorista precisa existir, estar ativo e ter e-mail cadastrado. Mantenha o mesmo `JWT_SECRET` nas próximas inicializações e em todas as instâncias da API; alterá-lo invalida os JWTs existentes.

Para provisionar a primeira conta administrativa, use `npm run set-admin-password`; ele configura a senha e promove o usuário selecionado a administrador. O backend impede que o último administrador ativo seja removido.

A API escuta em `http://localhost:3000`. Endpoints de autenticação e operação:

- `GET /health`
- `POST /api/auth/login` — recebe `{ "email", "password" }` e devolve JWT HS256 com validade de 8 horas e perfil do motorista.
- `GET /api/auth/me` — valida o bearer token e retorna o perfil ativo.
- `GET /api/routes/:id` — exige JWT válido, verifica atribuição do motorista (ou papel admin), valida cada parada pela calçada direita e monta/persiste a geometria se houver token Mapbox.
- `GET /api/routes` — lista rotas ativas do dia para o motorista autenticado, ou rotas ativas disponíveis para admin.
- `GET /api/routes/:id/candidates` e `PUT /api/routes/:id/stops` — listam alunos ativos da escola da rota e aplicam inclusões/remoções apenas às paradas dessa rota, recalculando sequência, geometria, distância e consumo. Motoristas só editam a própria rota da data corrente; administradores podem editar qualquer rota ativa.
- `GET /api/schools` e `POST /api/students` — listagem de escolas e cadastro de aluno/endereço, ambos exclusivos de administrador. O cadastro valida que a fachada esteja à direita do segmento orientado.
- `GET /api/admin/users` e `PATCH /api/admin/users/:id/permissions` — controle de papéis e contas, exclusivo de administradores.
- `POST /api/sync/events` — recebe eventos de presença e GPS, valida acesso às rotas e grava os eventos com deduplicação.

O servidor assina e valida os JWTs com HS256, `iss`/`aud` fixos e claims `sub`, `role`, `iat` e `exp`; `JWT_SECRET` deve ter pelo menos 32 bytes. O login limita a cinco tentativas inválidas por IP a cada 15 minutos por processo. Se executar várias instâncias, substitua esse limitador em memória por um armazenamento compartilhado. Em produção, sirva a API por HTTPS.

## Mobile e Android Studio

`mobile/App.js` é a raiz visual do app e `mobile/index.js` registra o componente no Expo. A navegação usa React Navigation. A tela GPS existente exibe a posição atual da van, rastreia em segundo plano e pode narrar as paradas. `RouteEditorScreen.jsx` edita os alunos do percurso de um dia; `NewStudentScreen.jsx` e `AdminPermissionsScreen.jsx` só aparecem para admins, com autorização também no backend. `SettingsScreen.jsx` oferece tema do sistema/claro/escuro, alto contraste, texto ampliado e narração; as preferências ficam salvas no dispositivo. O JWT fica no SecureStore do Android/iOS; ao expirar, o app retorna ao login. A fila offline em SQLite é mantida ao sair da sessão e sincroniza após novo login.

O mobile usa Expo SDK 57 com React Native 0.86.3 e React 19.2.3; os módulos nativos estão alinhados às versões compatíveis do SDK. `mobile/package-lock.json` registra a árvore validada. O `app.config.js` define os identificadores nativos `br.com.transporteescolar.app` para Android e iOS.

No PowerShell, copie e ajuste o ambiente do app e prepare o projeto Android nativo:

```powershell
cd mobile
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
npm ci
npx expo install --check
npx expo prebuild --platform android
```

No emulador Android, `10.0.2.2` aponta para o computador host. Para aparelho físico, use o endereço IP da máquina na rede local. Motoristas e admins entram com e-mail e senha provisionados pela gestão. Informe o ID da rota para abrir ou editar o percurso do dia. O cadastro exige coordenadas WGS84 da fachada e dos extremos do segmento de rua, orientado com a fachada à direita.

Abra a pasta `mobile/android` no Android Studio e execute o app pelo IDE. Também é possível compilar/instalar via Expo com `npm run android`, desde que Android Studio, JDK, Android SDK e um emulador/dispositivo estejam configurados. `npx expo prebuild` gera a pasta `android/` localmente a partir do JavaScript e da configuração Expo; ela é ignorada pelo Git e pode ser recriada a qualquer momento.

`GOOGLE_MAPS_ANDROID_API_KEY` pode ser omitida para gerar o projeto, mas o mapa do Android precisa de uma chave válida para carregar os tiles do Google Maps. Restrinja essa chave ao aplicativo e ao serviço de mapas no Google Cloud. O registro GPS em segundo plano exige um build nativo/de desenvolvimento e permissões de localização; Expo Go não executa essa tarefa.

## Otimização e segurança da parada

Em `backend/src/services/routeOptimizer.js`, a garagem/posição da van e a escola são as pontas fixas. O limite é de 27 alunos por rota, e a primeira parada é a criança alcançável com a menor distância viária desde a van. A Matrix API recebe `approaches=curb` e é dividida em blocos que respeitam o limite de coordenadas do provedor. `routingService.js` também divide rotas longas em trechos de até 25 coordenadas, aplica a aproximação pela calçada em cada parada e junta a geometria e as métricas dos trechos.

O Mapbox Optimization v1 aceita até 12 coordenadas por chamada; ele é consultado como referência apenas em rotas com até 10 alunos. Até esse tamanho, o otimizador usa busca exata na matriz. De 11 a 27 alunos, ele usa inserção de paradas e busca local, mantendo a primeira criança fixa e reduzindo a distância total até a escola; essa busca é heurística e não garante o ótimo global. Se a primeira parada mais próxima não permitir uma sequência viável, a otimização retorna erro em vez de substituí-la por outra criança. Em ambos os casos, as estimativas dependem das rotas e distâncias retornadas pelo Mapbox, e a validação do lado da rua depende de coordenadas e do segmento orientado corretamente.
