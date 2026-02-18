export async function postSlackWebhook(
  webhookUrl: string,
  input: {
    text: string;
  },
): Promise<void> {
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: input.text }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Slack webhook failed: ${res.status} ${res.statusText}${body ? ` - ${body}` : ''}`);
  }
}
