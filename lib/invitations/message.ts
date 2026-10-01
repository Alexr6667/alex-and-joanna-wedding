/** Absolute invitation URL for a raw token. */
export function invitationUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, "")}/invite/${token}`;
}

/** Fills `{first_name}` and `{link}` in the WhatsApp template. Other text is left as written. */
export function renderWhatsAppMessage(template: string, values: { firstName: string; link: string }): string {
  return template.replaceAll("{first_name}", values.firstName).replaceAll("{link}", values.link);
}
