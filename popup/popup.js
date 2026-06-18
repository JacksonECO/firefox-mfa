// Popup da extensão (task 01: apenas o esqueleto).
//
// Regra de arquitetura (ver CLAUDE.md e ia/02): este script NUNCA manipula a
// senha mestra, a CryptoKey ou um segredo em claro. Toda crypto vive no
// background.js; o popup apenas troca mensagens (UNLOCK, LIST_MFAS, GET_CODE,
// SAVE_MFA, REVEAL_SECRET) e renderiza dados usando textContent (nunca innerHTML).
//
// Por enquanto não há lógica — a UI real começa nas próximas tasks.

export {};
