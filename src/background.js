// Service worker / script de background da extensão (task 01: apenas o esqueleto).
//
// Este módulo é o DONO de toda a criptografia e de qualquer segredo em claro
// (ver CLAUDE.md e ia/02). A partir da task 02, aqui vão viver: a senha mestra
// em memória, a CryptoKey derivada (PBKDF2/AES-GCM), o timer de expiração de
// 2 minutos (via alarms) e o roteador de mensagens vindas do popup.
//
// Nota de plataforma: o MVP tem como alvo o Firefox, que executa o background
// de MV3 via "background.scripts" (event page não-persistente), não via
// "service_worker" como o Chrome. O comportamento esperado é o mesmo; só a
// chave do manifest difere. Ver README.md.
//
// Por enquanto não há lógica registrada.

export {};
