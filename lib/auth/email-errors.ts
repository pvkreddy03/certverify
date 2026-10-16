type EmailError = { code?: string; message?: string } | null;

export function explainEmailError(error: EmailError, action: "signup" | "confirmation" | "recovery"): string {
  const code = error?.code ?? "";
  const message = error?.message ?? "";
  if (code === "over_email_send_rate_limit" || /rate limit|too many requests|email rate limit/i.test(message)) {
    return "Email sending is temporarily limited. Please wait a few minutes before trying again. Repeated clicks will not send the email sooner.";
  }
  if (code === "email_address_invalid") {
    return "Please check the email address and try again.";
  }
  if (code === "email_not_confirmed") {
    return "Your email address has not been confirmed. Open the confirmation email or request a new link below.";
  }
  if (action === "recovery") {
    return "We could not send the reset link right now. Please try again later.";
  }
  return message || (action === "signup" ? "Unable to create your account right now." : "Unable to resend the confirmation email right now.");
}
