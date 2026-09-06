export function normalizePhone(phone: string): string {
  // Remove spaces and dashes
  let normalized = phone.replace(/[\s-]/g, "");
  
  // Preserve international format (starts with +)
  // Validation: must start with + or be 9-15 digits
  if (!normalized.startsWith("+") && !/^\d{9,15}$/.test(normalized)) {
    throw new Error("Invalid phone format");
  }
  
  return normalized;
}
