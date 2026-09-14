/**
 * The fake provider's signature for a webhook body (M3-03): the one the app checks while the
 * fake is the provider in use. It either matches the body and the secret, or it does not, which
 * is all the route needs to know.
 */
export function fakeSignature(body: string, secret = 'whsec_local_fake'): string {
  let hash = 5381;
  for (const character of `${secret}.${body}`) {
    hash = ((hash << 5) + hash + (character.codePointAt(0) ?? 0)) % 0xffffffff;
  }
  return `fake_sig_${hash.toString(16)}`;
}
