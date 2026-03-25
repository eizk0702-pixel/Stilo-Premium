# Stilo Premium

Aplicação web estática para **GitHub Pages** com **HTML, CSS, JavaScript puro + Firebase Authentication + Firestore**.

## Estrutura

```text
stilo-premium/
├─ index.html
├─ admin.html
├─ styles.css
├─ app.js
├─ admin.js
├─ firebase-config.js
├─ firestore.rules
├─ README.md
└─ assets/
   └─ favicon.svg
```

## O que o projeto entrega

- landing page premium preto e dourado
- catálogo dinâmico de serviços
- carrinho com total e duração
- agenda com disponibilidade real
- reserva com travas atômicas por slot no Firestore
- confirmação no WhatsApp do número da barbearia
- painel admin com:
  - dashboard
  - agenda diária
  - bloqueio manual
  - gestão de pedidos
  - gestão de serviços
  - configurações da loja

## Importante sobre a lógica de disponibilidade

Como você pediu **site estático + Firebase**, sem backend próprio, a aplicação usa uma estratégia de travas por slots na coleção `scheduleLocks`:

- cada atendimento reserva vários slots de **5 em 5 minutos**
- o agendamento público faz uma **transação**
- se qualquer slot do intervalo já estiver ativo, a compra falha
- isso evita que dois clientes reservem o mesmo intervalo ao mesmo tempo

Em um sistema com backend dedicado, a blindagem anti-abuso ficaria ainda melhor. Sem backend, essa é a solução mais robusta possível sem sair da arquitetura que você exigiu.

---

## 1) Criar o projeto no Firebase

1. Acesse o console do Firebase
2. Crie um projeto
3. Adicione um app **Web**
4. Copie as credenciais do app

### Authentication

1. Vá em **Authentication**
2. Clique em **Get started**
3. Ative o método **Email/Password**

### Firestore

1. Vá em **Firestore Database**
2. Clique em **Create database**
3. Escolha o modo **Production**
4. Escolha a região mais próxima do Brasil

---

## 2) Configurar `firebase-config.js`

Abra `firebase-config.js` e substitua:

```js
export const firebaseConfig = {
  apiKey: "COLE_AQUI",
  authDomain: "COLE_AQUI.firebaseapp.com",
  projectId: "COLE_AQUI",
  storageBucket: "COLE_AQUI.firebasestorage.app",
  messagingSenderId: "COLE_AQUI",
  appId: "COLE_AQUI"
};
```

---

## 3) Aplicar regras do Firestore

No console do Firebase, abra **Firestore Database > Rules** e cole o conteúdo de `firestore.rules`.

### Observação sincera, porque alguém precisa ser

Sem backend, para o site público conseguir reservar agenda, ele precisa criar documentos em `bookings` e em `scheduleLocks`.  
As regras abaixo restringem bastante o formato dos dados, mas **não substituem** um backend validando tudo em ambiente confiável.

Se um dia você quiser blindagem máxima, mova a criação de pedidos para **Cloud Functions** ou outro backend seguro.

---

## 4) Criar o usuário administrador

1. Abra **Authentication > Users**
2. Clique em **Add user**
3. Crie o e-mail e senha do admin

Depois disso:

1. Abra **Firestore Database > Data**
2. Crie a coleção `users`
3. Crie um documento com o **UID** do usuário criado no Authentication
4. Coloque o campo:

```json
{
  "role": "admin",
  "email": "seu-admin@dominio.com"
}
```

---

## 5) Criar configurações iniciais

No painel admin, aba **Configurações**, salve ao menos uma vez.

O sistema grava o documento:

```text
settings/general
```

Campos usados:

- `shopName`
- `whatsappNumber`
- `businessHoursStart`
- `businessHoursEnd`
- `intervalMinutes`
- `timezone`
- `whatsappIntro`

---

## 6) Inserir dados iniciais dos serviços

Você tem duas formas.

### Forma prática
Entre em `admin.html`, faça login e clique em:

**Serviços > Restaurar serviços padrão**

### Forma manual
Crie a coleção `services` com estes documentos:

#### `services/corte`
```json
{
  "id": "corte",
  "name": "Corte",
  "description": "Corte premium com acabamento refinado.",
  "price": 45,
  "durationMinutes": 30,
  "active": true
}
```

#### `services/penteado`
```json
{
  "id": "penteado",
  "name": "Penteado",
  "description": "Finalização para elevar presença e definição.",
  "price": 25,
  "durationMinutes": 20,
  "active": true
}
```

#### `services/sobrancelha`
```json
{
  "id": "sobrancelha",
  "name": "Sobrancelha",
  "description": "Desenho limpo e alinhado ao seu rosto.",
  "price": 15,
  "durationMinutes": 10,
  "active": true
}
```

#### `services/barba`
```json
{
  "id": "barba",
  "name": "Barba",
  "description": "Modelagem e acabamento com presença de alto nível.",
  "price": 30,
  "durationMinutes": 20,
  "active": true
}
```

#### `services/tratamento-pele`
```json
{
  "id": "tratamento-pele",
  "name": "Tratamento de pele",
  "description": "Cuidado facial para limpeza, hidratação e aparência premium.",
  "price": 40,
  "durationMinutes": 30,
  "active": true
}
```

---

## 7) Modelagem usada

### `services`
```json
{
  "id": "corte",
  "name": "Corte",
  "description": "Corte premium com acabamento refinado.",
  "price": 45,
  "durationMinutes": 30,
  "active": true,
  "createdAt": "timestamp",
  "updatedAt": "timestamp"
}
```

### `bookings`
```json
{
  "customerName": "João",
  "customerPhone": "(11) 99999-9999",
  "customerPhoneDigits": "11999999999",
  "notes": "Nenhuma",
  "date": "2026-03-25",
  "startTime": "10:00",
  "endTime": "11:20",
  "startTimestamp": "timestamp",
  "endTimestamp": "timestamp",
  "startMinuteOfDay": 600,
  "endMinuteOfDay": 680,
  "items": [
    { "id": "corte", "name": "Corte", "price": 45, "durationMinutes": 30 }
  ],
  "totalPrice": 45,
  "totalDurationMinutes": 30,
  "status": "pending",
  "source": "site",
  "timezone": "America/Sao_Paulo",
  "lockIds": ["2026-03-25_1000", "2026-03-25_1005"],
  "createdAt": "timestamp",
  "updatedAt": "timestamp"
}
```

### `manualBlocks`
```json
{
  "date": "2026-03-25",
  "startTime": "12:00",
  "endTime": "13:00",
  "reason": "Almoço",
  "active": true,
  "createdBy": "uid-do-admin",
  "lockIds": ["2026-03-25_1200", "2026-03-25_1205"],
  "createdAt": "timestamp",
  "updatedAt": "timestamp"
}
```

### `settings/general`
```json
{
  "shopName": "Stilo Premium",
  "whatsappNumber": "5511996511471",
  "businessHoursStart": "09:00",
  "businessHoursEnd": "21:00",
  "intervalMinutes": 30,
  "timezone": "America/Sao_Paulo",
  "whatsappIntro": "Olá, Jhow! Gostaria de confirmar meu agendamento na Stilo Premium."
}
```

### `users/{uid}`
```json
{
  "role": "admin",
  "email": "admin@stilopremium.com"
}
```

### `scheduleLocks`
Coleção auxiliar usada para garantir concorrência segura:

```json
{
  "active": true,
  "type": "booking",
  "bookingId": "abc123",
  "date": "2026-03-25",
  "time": "10:00",
  "slotGranularityMinutes": 5,
  "startTime": "10:00",
  "endTime": "11:20",
  "createdAt": "timestamp",
  "updatedAt": "timestamp"
}
```

---

## 8) Publicar no GitHub Pages

### Opção simples

1. Suba esta pasta para um repositório no GitHub
2. Vá em **Settings > Pages**
3. Em **Source**, escolha:
   - branch: `main`
   - folder: `/root`
4. Salve

O GitHub vai gerar uma URL tipo:

```text
https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO/
```

### Usar domínio próprio
Se você quiser URL bonita, use domínio próprio:

1. Compre ou use um domínio
2. Em **Settings > Pages**, configure o domínio customizado
3. Crie um arquivo `CNAME` na raiz do projeto com o domínio
4. Ajuste DNS no registrador

Exemplo de conteúdo do arquivo `CNAME`:

```text
agende.stilopremium.com.br
```

---

## 9) Fluxo de teste recomendado

1. Entre em `admin.html`
2. Faça login com o admin
3. Clique em **Restaurar serviços padrão**
4. Salve as configurações
5. Vá para `index.html`
6. Adicione serviços ao carrinho
7. Escolha uma data
8. Escolha um horário
9. Finalize o pedido
10. Confira se:
   - o pedido apareceu em `bookings`
   - os slots apareceram em `scheduleLocks`
   - o horário sumiu da agenda pública
   - o pedido apareceu no painel admin

---

## 10) Melhorias futuras sensatas

Se você quiser elevar isso depois:

- Cloud Functions para fechar o loop com segurança máxima
- paginação real de pedidos
- logs de auditoria do admin
- múltiplos profissionais
- cupom ou desconto
- confirmação automática por WhatsApp Business API
- painel de métricas por semana/mês
- reordenação visual da agenda em timeline mais rica

O básico já está funcional. O resto é o eterno esporte humano de adicionar complexidade até quebrar algo.
