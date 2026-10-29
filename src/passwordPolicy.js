// Password rules for joiners (registration, reset, change password).
// The auth edge function checks the same rules on the server.
export const PASSWORD_RULES = [
  { id: 'length', label: 'At least 8 characters', test: (p) => p.length >= 8 },
  { id: 'upper', label: 'An uppercase letter (A–Z)', test: (p) => /[A-Z]/.test(p) },
  { id: 'lower', label: 'A lowercase letter (a–z)', test: (p) => /[a-z]/.test(p) },
  { id: 'number', label: 'A number (0–9)', test: (p) => /[0-9]/.test(p) },
  { id: 'special', label: 'A special character (e.g. ! @ # $ %)', test: (p) => /[^A-Za-z0-9]/.test(p) },
];

// Rules the password doesn't meet yet (empty array = OK).
export const passwordProblems = (password) =>
  PASSWORD_RULES.filter((r) => !r.test(password || '')).map((r) => r.label);

export const passwordErrorMessage = (password) => {
  const problems = passwordProblems(password);
  // "An uppercase letter (A–Z)" → "an uppercase letter (A–Z)": only the first letter changes.
  return problems.length ? `Your password needs: ${problems.map((p) => p[0].toLowerCase() + p.slice(1)).join(', ')}.` : '';
};
