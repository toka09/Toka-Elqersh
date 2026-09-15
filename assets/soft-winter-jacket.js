import { CartLinesUpdateEvent, StandardEvents } from '@shopify/events';

/** @type {{ handle: string | null, variant_id: number | null }} */
let jacket = { handle: null, variant_id: null };
try {
  jacket = JSON.parse(document.querySelector('#soft-winter-jacket-config')?.textContent || 'null') || jacket;
} catch (error) {
  console.warn('Soft Winter Jacket configuration could not be read.', error);
}
const jacketHandle = jacket.handle;
const jacketVariantId = Number(jacket.variant_id) || 0;
const shopRoot = window.Shopify?.routes?.root || '/';
/** @param {string} path */
const route = (path) => `${shopRoot}${path}`;

/** @typedef {{ variant_id: number, handle: string, options_with_values: { name: string, value: string }[] }} CartItem */

/** @type {Promise<unknown>} */
let addQueue = Promise.resolve();

/** @param {CartItem} item */
const hasBlackMedium = (item) => {
  if (item.handle === jacketHandle) return false;
  const options = item.options_with_values || [];
  const color = options.find((option) => ['color', 'colour'].includes(option.name.trim().toLowerCase()));
  const size = options.find((option) => option.name.trim().toLowerCase() === 'size');
  return color?.value.trim().toLowerCase() === 'black' &&
    ['m', 'medium'].includes(size?.value.trim().toLowerCase() || '');
};

/** @param {number} quantity */
const addJacket = async (quantity) => {
  if (!jacketVariantId) throw new Error('Soft Winter Jacket is not configured in the theme settings.');

  const sectionIds = [...new Set(
    [...document.querySelectorAll('cart-items-component')]
      .map((component) => component instanceof HTMLElement ? component.dataset.sectionId : '')
      .filter(Boolean)
  )];
  const response = await fetch(route('cart/add.js'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      items: [{ id: jacketVariantId, quantity }],
      sections: sectionIds.join(','),
      sections_url: window.location.pathname
    })
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.description || 'Soft Winter Jacket could not be added.');

  const cartResponse = await fetch(route('cart.js'), { cache: 'no-store' });
  if (!cartResponse.ok) throw new Error('The cart could not be refreshed.');
  const cart = /** @type {import('./standard-events').CartAjaxResponse} */ (await cartResponse.json());
  const totalQuantity = cart.items.reduce((count, item) => count + item.quantity, 0);

  document.dispatchEvent(new CartLinesUpdateEvent({
    action: 'add',
    context: 'standard-action',
    lines: [{ merchandiseId: String(jacketVariantId), quantity }],
    promise: Promise.resolve({
      cart: CartLinesUpdateEvent.createCartFromAjaxResponse(cart),
      detail: {
        items: cart.items,
        sections: result.sections,
        itemCount: totalQuantity,
        source: 'soft-winter-jacket',
        didError: false
      }
    })
  }));
};

document.addEventListener(StandardEvents.cartLinesUpdate, (event) => {
  if (!(event instanceof CartLinesUpdateEvent) || event.action !== 'add' || !event.promise) return;

  event.promise.then(({ detail }) => {
    if (detail?.didError || detail?.source === 'soft-winter-jacket') return;
    const items = /** @type {CartItem[]} */ (detail?.items || []);
    const quantity = event.lines.reduce((count, line) => {
      const item = items.find((candidate) => String(candidate.variant_id) === line.merchandiseId);
      return item && hasBlackMedium(item) ? count + line.quantity : count;
    }, 0);

    if (quantity > 0) {
      addQueue = addQueue.then(() => addJacket(quantity)).catch((error) => {
        console.warn('Could not auto-add Soft Winter Jacket.', error);
      });
    }
  }).catch(() => {});
});
