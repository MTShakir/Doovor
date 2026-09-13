import { render } from '@react-email/render';
import { createElement } from 'react';
import { NotificationEmail, type NotificationEmailProps } from './notification.tsx';

export interface RenderedEmail {
  subject: string;
  html: string;
  /** The same message in words, for clients that will not show HTML. */
  text: string;
}

/** One notification, as an email ready to hand to a provider (NTF-03, M2-28). */
export async function renderNotificationEmail(props: NotificationEmailProps): Promise<RenderedEmail> {
  const element = createElement(NotificationEmail, props);
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
  return { subject: props.title, html, text };
}
