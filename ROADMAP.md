Roadmap de Desenvolvimento: Catan Web Multiplayer

Agora que enviaste o prompt inicial, o Claude está a processar a arquitetura. Aqui está o plano de ação passo a passo para guiares a IA até teres o jogo pronto.

Passo 1: Avaliar a Resposta do Claude (Arquitetura)

O Claude deve responder com 4 pontos:

Lista de eventos WebSocket.

Esquema do SQLite.

Explicação matemática do grid hexagonal.

Estrutura de pastas do monorepo.

O que deves fazer: Lê a resposta. Se fizer sentido para ti e parecer bem estruturada, avança para o Passo 2. Se achares que falta algo (por exemplo, ele esqueceu-se da regra do Ladrão), corrige-o antes de avançar.

Passo 2: Construir a Base e o Lobby (O teu próximo Prompt)

Assim que aprovares a arquitetura, copia e cola o texto abaixo no Claude. Isso vai forçá-lo a criar a fundação do projeto sem se distrair com a lógica complexa do jogo.

Copia e cola no Claude:

"Arquitetura aprovada! Vamos iniciar a codificação pela Fase 1: Setup e Lobby.

Tarefas para esta fase:

Cria a configuração inicial do backend em Node.js (package.json, dependências, tsconfig).

Configura a ligação ao SQLite e cria as tabelas iniciais (Users e Rooms).

Configura o servidor WebSocket e cria os eventos básicos de: create_room, join_room e o broadcast de room_state_updated.

No frontend (React), cria a interface simples para o utilizador introduzir o seu nome e escolher entre 'Criar Sala' ou 'Entrar em Sala' (com código).

Por favor, fornece-me os comandos de terminal necessários para iniciar o projeto e o código dos ficheiros principais desta fase."

Passo 3: Renderizar o Tabuleiro (O teu 3º Prompt)

Depois de testares o Lobby e veres que dois navegadores conseguem entrar na mesma sala de espera e comunicar via WebSocket, avança para o tabuleiro.

Copia e cola no Claude:

"Excelente, o Lobby e os WebSockets base estão a funcionar! Vamos para a Fase 2: Geração e Renderização do Tabuleiro.

Tarefas para esta fase:

No backend, cria a lógica que gera o tabuleiro inicial de forma aleatória (distribuição dos 19 hexágonos, dos portos marítimos e das fichas numeradas, deixando o deserto sem número).

O backend deve emitir o evento board_generated com o array de hexágonos para o frontend quando a sala estiver cheia e o host clicar em 'Iniciar Jogo'.

No frontend (React), cria o componente Board que consome este array e desenha o grid hexagonal na ecrã. Concentra-te apenas em desenhar os hexágonos com as cores/texturas corretas e os números em cima.

Mostra-me como estruturar as coordenadas (axiais ou cúbicas) no backend e como o React as mapeia para a ecrã (x, y pixels)."

Passo 4: O Ciclo do Jogo - Fase de Fundação (O teu 4º Prompt)

Quando o tabuleiro aparecer bonito na tua ecrã para todos os jogadores, é hora de colocar as primeiras peças.

Copia e cola no Claude:

"O tabuleiro está a renderizar perfeitamente de forma sincronizada! Vamos para a Fase 3: Fase de Fundação e Colocação de Peças.

Tarefas para esta fase:

Cria a máquina de estados no backend para gerir de quem é o turno.

Implementa a lógica da 'Fase de Fundação' (onde a ordem é 1-2-3-4 e depois 4-3-2-1).

Cria os eventos WebSocket build_settlement (construir aldeia) e build_road (construir estrada).

O backend DEVE validar a 'Regra da Distância' (não pode haver aldeias em intersecções adjacentes) antes de permitir a construção e atualizar o estado.

Atualiza o frontend para permitir clicar nas intersecções (para aldeias) e arestas (para estradas) durante a vez do jogador.

Vamos focar-nos APENAS na Fase de Fundação por agora. Sem rolar dados ainda."

Passo 5: Rolar os Dados e Recursos (O teu 5º Prompt)

Depois de todos colocarem as suas 2 aldeias e 2 estradas, o jogo a sério começa.

Copia e cola no Claude:

"As aldeias iniciais estão a ser colocadas e a regra de distância funciona! Vamos para a Fase 4: O Ciclo de Turnos e Produção de Recursos.

Tarefas para esta fase:

Adiciona o evento roll_dice. O backend calcula um número de 2 a 12 e emite para todos.

Se o número não for 7, o backend verifica quem tem aldeias/cidades adjacentes aos hexágonos com esse número e incrementa o inventário de recursos desses jogadores.

Se sair 7, aciona o evento move_robber e a lógica de descartar cartas (para quem tem mais de 7 cartas).

Adiciona ao frontend uma interface para os jogadores verem a sua 'Mão de Cartas' (quantidades de Madeira, Tijolo, Ovelha, Trigo, Minério) e um botão para lançar os dados quando for o seu turno."

Dicas para o Sucesso:

Testa tudo aos poucos: Nunca avances para a próxima fase do roadmap sem testar a atual no teu computador (abrindo janelas anónimas para simular múltiplos jogadores).

Se o código quebrar: Copia o erro que aparecer na consola do browser ou no terminal do Node e diz ao Claude: "Encontrei este erro ao executar a Fase X: [COLA O ERRO AQUI]. Como corrigimos?".