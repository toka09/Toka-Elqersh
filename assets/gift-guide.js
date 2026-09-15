(() => {
  /** @typedef {string | { name: string }} GiftGuideOption */
  /** @typedef {{ handle: string, title: string, description: string, featured_image: string, images: string[], options: GiftGuideOption[], variants: { id: number, price: number, available: boolean, options: string[] }[] }} GiftGuideProduct */
  /** @typedef {{ id: number, quantity: number }} GiftGuideCartItem */
  /** @typedef {{ key: string, image: string | null, product_title: string, variant_title: string | null, quantity: number, final_line_price: number }} GuideCartLine */
  /** @typedef {{ items: GuideCartLine[], total_price: number }} GuideCart */

  if (window.GiftGuideInitialized) return;
  window.GiftGuideInitialized = true;

  const shopRoot = () => window.Shopify?.routes?.root || '/';

  /** @param {string} path
   *  @param {RequestInit} [options] */
  const requestJson = async (path, options = {}) => {
    const response = await fetch(shopRoot() + path, {
      ...options,
      headers: { Accept: 'application/json', ...options.headers }
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new Error(result?.description || result?.message || 'The request failed. Please try again.');
    if (!result) throw new Error('The store returned an unreadable response. Please try again.');
    return result;
  };

  const storefrontApi = {
    /** @param {string} handle
     *  @param {AbortSignal} signal
     *  @returns {Promise<GiftGuideProduct>} */
    getProduct(handle, signal) {
      return requestJson('products/' + encodeURIComponent(handle) + '.js', { signal });
    },

    /** @param {GiftGuideCartItem[]} items */
    addItems(items) {
      return requestJson('cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items })
      });
    },

    /** @returns {Promise<GuideCart>} */
    getCart() {
      return requestJson('cart.js', { cache: 'no-store' });
    },

    /** @param {string} key
     *  @returns {Promise<GuideCart>} */
    removeItem(key) {
      return requestJson('cart/change.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: key, quantity: 0 })
      });
    }
  };

  const moneyFormatter = new Intl.NumberFormat(document.documentElement.lang || 'en', {
    style: 'currency',
    currency: window.Shopify?.currency?.active || 'EUR'
  });

  /** @param {number} cents */
  const money = (cents) => moneyFormatter.format(Number(cents || 0) / 100);

  const escapeHtml = (value = '') =>
    String(value).replace(/[&<>"']/g, (character) => {
      /** @type {Record<string, string>} */
      const characters = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      };

      return characters[character] || character;
    });

  /** @param {GiftGuideOption} option */
  const getOptionName = (option) =>
    typeof option === 'string' ? option : option.name;

  /** @param {GiftGuideProduct} product
   *  @param {HTMLFormElement} form */
  const getSelectedVariant = (product, form) => product.variants.find((variant) =>
    variant.available && product.options.every((option, index) => {
      const input = form.elements.namedItem('option-' + index);
      return input instanceof HTMLInputElement && variant.options[index] === input.value;
    })
  );

  /** @type {Record<string, string>} */
  const colorAccents = {
    blue: '#1b4f94', red: '#b4163a', grey: '#858585', gray: '#858585',
    white: '#ffffff', black: '#111111', green: '#386b42', yellow: '#d4ae23',
    pink: '#cf799b', brown: '#795444', navy: '#243e68', purple: '#744b8e'
  };

  /** @param {string} value */
  const colorAccent = (value) => colorAccents[value.trim().toLowerCase()] || '#111111';

  /** @param {GiftGuideProduct} product */
  const renderOptions = (product) =>
    product.options
      .map((option, index) => {
        const optionName = getOptionName(option);
        const isSize = optionName.trim().toLowerCase() === 'size';
        const isColor = ['color', 'colour'].includes(optionName.trim().toLowerCase());
        const values = [
          ...new Set(
            product.variants
              .map((variant) => variant.options[index] || '')
              .filter(Boolean)
          )
        ];
        const initialVariant = product.variants.find((variant) => variant.available) || product.variants[0];
        const initialActualValue = initialVariant?.options[index] || values[0] || '';

        const buttons = values
          .map(
            (value) => `
              <button
                type="button"
                class="${isSize ? 'gift-guide-size-option' : 'gift-guide-option'}${
                  !isSize && value === initialActualValue ? ' is-selected' : ''
                }"
                data-option-value="${escapeHtml(value)}"
                aria-pressed="${!isSize && value === initialActualValue}"
                ${isColor ? `style="--option-accent:${colorAccent(value)}"` : ''}
              >
                ${escapeHtml(value)}
              </button>
            `
          )
          .join('');

        return `
          <fieldset class="gift-guide-option-group${isColor ? ' gift-guide-option-group--color' : ''}">
            <legend>${escapeHtml(optionName)}</legend>

            <div class="${isSize ? 'gift-guide-size-picker' : 'gift-guide-option-list'}" data-option-group="${index}">
              ${isSize ? `<details data-size-menu>
                <summary class="gift-guide-size-trigger" data-size-label>Choose your size</summary>
                <div class="gift-guide-size-options">${buttons}</div>
              </details>` : buttons}
            </div>

            <input
              type="hidden"
              name="option-${index}"
              value="${isSize ? '' : escapeHtml(initialActualValue)}"
            >
          </fieldset>
        `;
      })
      .join('');

  /** @param {GiftGuideProduct} product
   *  @param {string} titleId */
  const renderProduct = (product, titleId) => {
    const firstVariant = product.variants.find((variant) => variant.available) || product.variants[0];

    if (!firstVariant) {
      return '<p class="gift-guide-form-message">This product has no variants.</p>';
    }

    const imageUrl = product.featured_image || product.images?.[0] || '';
    const image = imageUrl
      ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(product.title)}">`
      : '';

    return `
      <div class="gift-guide-modal__media">${image}</div>

      <div class="gift-guide-modal__details">
        <h3 id="${escapeHtml(titleId)}">${escapeHtml(product.title)}</h3>

        <p class="gift-guide-modal__price" data-price>
          ${money(firstVariant.price)}
        </p>

        <div class="gift-guide-modal__description">
          ${product.description || ''}
        </div>

      </div>

      <form class="gift-guide-modal__form" data-gift-guide-form>
        ${renderOptions(product)}

        <p
          class="gift-guide-form-message"
          data-form-message
          aria-live="polite"
        ></p>

        <button
          class="gift-guide-button gift-guide-add-button"
          type="submit"
        >
          <span>ADD TO CART</span>
          <span class="gift-guide-arrow" aria-hidden="true">→</span>
        </button>
      </form>
    `;
  };

  /** @param {HTMLElement} panel
   *  @param {GuideCart} cart
   *  @param {string} notice */
  const renderCartPanel = (panel, cart, notice) => {
    const itemList = panel?.querySelector('[data-gift-guide-cart-items]');
    const total = panel?.querySelector('[data-gift-guide-cart-total]');
    const noticeElement = panel?.querySelector('[data-gift-guide-cart-notice]');
    if (!(itemList instanceof HTMLElement) || !(total instanceof HTMLElement)) return;

    itemList.innerHTML = cart.items.length ? cart.items.map((item) => `
      <div class="gift-guide-cart__item">
        ${item.image ? `<img src="${escapeHtml(item.image)}" alt="">` : ''}
        <div>
          <p>${escapeHtml(item.product_title)}</p>
          <small>${escapeHtml(item.variant_title === 'Default Title' ? '' : item.variant_title || '')}</small>
          <small>Quantity: ${Number(item.quantity)}</small>
          <strong>${money(item.final_line_price)}</strong>
          <button type="button" class="gift-guide-cart__remove" data-gift-guide-remove="${escapeHtml(item.key)}" aria-label="Remove ${escapeHtml(item.product_title)} from cart">Remove</button>
        </div>
      </div>
    `).join('') : '<p>Your cart is empty.</p>';
    total.textContent = `Total: ${money(cart.total_price)}`;
    const checkout = panel.querySelector('[data-gift-guide-checkout]');
    if (checkout instanceof HTMLElement) checkout.hidden = cart.items.length === 0;
    if (noticeElement instanceof HTMLElement) {
      noticeElement.textContent = notice;
      noticeElement.hidden = !notice;
    }
  };

  /** @param {HTMLElement} grid
   *  @param {string} notice */
  const openCartPanel = async (grid, notice) => {
    const panel = grid.querySelector('[data-gift-guide-cart]');
    if (!(panel instanceof HTMLElement)) return;

    const cart = await storefrontApi.getCart();
    if (!grid.isConnected) return;
    renderCartPanel(panel, cart, notice);
    panel.setAttribute('aria-hidden', 'false');
    document.body.classList.add('gift-guide-modal-open');
    const closeButton = panel.querySelector('button[data-gift-guide-cart-close]');
    if (closeButton instanceof HTMLElement) closeButton.focus();
  };

  /** @param {HTMLElement} panel
   *  @param {string} key */
  const removeCartLine = async (panel, key) => {
    const cart = await storefrontApi.removeItem(key);
    renderCartPanel(panel, cart, '');
  };

  /** @param {GiftGuideProduct} product
   *  @param {{ options: string[] }} variant */
  const isBlackMedium = (product, variant) => {
    const colorIndex = product.options.findIndex(
      (option) => ['color', 'colour'].includes(getOptionName(option).trim().toLowerCase())
    );

    const sizeIndex = product.options.findIndex(
      (option) => getOptionName(option).trim().toLowerCase() === 'size'
    );

    return (
      colorIndex >= 0 &&
      sizeIndex >= 0 &&
      String(variant.options[colorIndex]).trim().toLowerCase() === 'black' &&
      ['m', 'medium'].includes(String(variant.options[sizeIndex]).trim().toLowerCase())
    );
  };

  /** @param {HTMLElement} grid */
  const createGiftGuideController = (grid) => {
    const modal = grid.querySelector('[data-gift-guide-modal]');
    const content = grid.querySelector('[data-gift-guide-modal-content]');

    if (!(modal instanceof HTMLElement) || !(content instanceof HTMLElement)) {
      return;
    }

    /** @type {{ handle: string | null, variant_id: number | null }} */
    let companionData = { handle: null, variant_id: null };
    try {
      companionData = JSON.parse(grid.querySelector('[data-gift-guide-companion]')?.textContent || 'null') || companionData;
    } catch (error) {
      console.warn('Gift Guide companion configuration could not be read.', error);
    }
    const companionHandle = companionData.handle;
    const companionVariantId = companionData.variant_id;

    const listeners = new AbortController();
    /** @type {AbortController | null} */
    let productRequest = null;
    let cartBusy = false;

    /** @param {boolean} busy */
    const setCartBusy = (busy) => {
      cartBusy = busy;
      grid.querySelectorAll('.gift-guide-add-button, [data-gift-guide-remove]').forEach((button) => {
        if (button instanceof HTMLButtonElement) button.disabled = busy;
      });
    };

    /** @type {GiftGuideProduct | null} */
    let currentProduct = null;
    /** @type {HTMLElement | null} */
    let previouslyFocused = null;

    const closeModal = () => {
      productRequest?.abort();
      modal.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('gift-guide-modal-open');

      if (previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected) {
        previouslyFocused.focus();
      }
    };

    /** @param {string} handle
     *  @param {HTMLElement} trigger */
    const openModal = async (handle, trigger) => {
      previouslyFocused = trigger;
      currentProduct = null;
      productRequest?.abort();
      const requestController = new AbortController();
      productRequest = requestController;

      content.innerHTML =
        '<p class="gift-guide-form-message">Loading product…</p>';

      modal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('gift-guide-modal-open');

      try {
        const product = await storefrontApi.getProduct(handle, requestController.signal);
        if (requestController.signal.aborted || !grid.isConnected) return;
        currentProduct = product;
        content.innerHTML = renderProduct(product, grid.id + '-title');
        setCartBusy(cartBusy);

        const closeButton = modal.querySelector('button[data-gift-guide-close]');

        if (closeButton instanceof HTMLElement) {
          closeButton.focus();
        }
      } catch (error) {
        if (requestController.signal.aborted) return;
        content.innerHTML = `
          <p class="gift-guide-form-message">
            ${escapeHtml(error instanceof Error ? error.message : 'Unable to load this product.')}
          </p>
        `;
      }
    };

    /** @param {Event} event */
    const handleProductClick = (event) => {
      if (!(event.target instanceof Element)) return;
      const button = event.target.closest('[data-gift-guide-open]');
      const card = button?.closest('[data-product-handle]');
      if (button instanceof HTMLElement && card instanceof HTMLElement && card.dataset.productHandle) {
        openModal(card.dataset.productHandle, button);
      }
    };

    /** @param {Event} event */
    const handleOptionClick = (event) => {
      if (!(event.target instanceof Element)) return;

      if (event.target.closest('[data-gift-guide-close]')) {
        closeModal();
        return;
      }

      const optionButton = event.target.closest('[data-option-value]');

      if (!(optionButton instanceof HTMLElement) || !currentProduct) return;

      const optionGroup = optionButton.closest('[data-option-group]');
      const form = modal.querySelector('[data-gift-guide-form]');
      const price = modal.querySelector('[data-price]');
      const input = optionGroup?.nextElementSibling;

      if (
        !(input instanceof HTMLInputElement) ||
        !(form instanceof HTMLFormElement) ||
        !price ||
        !optionGroup
      ) {
        return;
      }

      optionGroup
        .querySelectorAll('[data-option-value]')
        .forEach((item) => {
          item.classList.toggle('is-selected', item === optionButton);
          item.setAttribute('aria-pressed', String(item === optionButton));
        });

      const selectedValue = optionButton.dataset.optionValue || '';
      input.value = selectedValue;

      const sizeMenu = optionGroup.querySelector('[data-size-menu]');
      const sizeLabel = optionGroup.querySelector('[data-size-label]');
      if (sizeLabel) sizeLabel.textContent = selectedValue;
      if (sizeMenu instanceof HTMLDetailsElement) {
        sizeMenu.open = false;
        if (sizeLabel instanceof HTMLElement) sizeLabel.focus();
      }

      const message = form.querySelector('[data-form-message]');
      if (message) message.textContent = '';

      const variant = getSelectedVariant(currentProduct, form);

      if (variant) {
        price.textContent = money(variant.price);
      }
    };

    /** @param {Event} event */
    const handleAddToCart = async (event) => {
      if (
        !(event.target instanceof HTMLFormElement) ||
        !event.target.matches('[data-gift-guide-form]') ||
        !currentProduct
      ) {
        return;
      }

      event.preventDefault();
      if (cartBusy) return;

      const form = event.target;
      const message = form.querySelector('[data-form-message]');
      const submitButton = form.querySelector('[type="submit"]');

      if (
        !(message instanceof HTMLElement) ||
        !(submitButton instanceof HTMLButtonElement)
      ) {
        return;
      }

      const missingSize = currentProduct.options.some((option, index) => {
        if (getOptionName(option).trim().toLowerCase() !== 'size') return false;
        const input = form.querySelector(`[name="option-${index}"]`);
        return !(input instanceof HTMLInputElement) || !input.value;
      });
      if (missingSize) {
        message.textContent = 'Choose your size.';
        const sizeMenu = form.querySelector('[data-size-menu]');
        if (sizeMenu instanceof HTMLDetailsElement) sizeMenu.open = true;
        return;
      }

      const variant = getSelectedVariant(currentProduct, form);

      if (!variant?.available) {
        message.textContent = 'This option is sold out.';
        return;
      }

      try {
        setCartBusy(true);
        message.textContent = 'Adding to cart…';

        const items = [{ id: variant.id, quantity: 1 }];
        let companionMissing = false;

        if (
          isBlackMedium(currentProduct, variant) &&
          companionHandle !== currentProduct.handle
        ) {
          if (companionVariantId) {
            items.push({ id: companionVariantId, quantity: 1 });
          } else {
            companionMissing = true;
          }
        }

        await storefrontApi.addItems(items);
        if (!grid.isConnected) return;

        message.textContent =
          items.length > 1
            ? 'Added with Soft Winter Jacket.'
            : 'Added to cart.';

        closeModal();
        try {
          await openCartPanel(
            grid,
            companionMissing
              ? 'Your item was added. Soft Winter Jacket is currently unavailable.'
              : ''
          );
        } catch (error) {
          console.warn('Gift Guide cart panel could not be opened.', error);
          window.location.assign(shopRoot() + 'cart');
        }
      } catch (error) {
        message.textContent =
          error instanceof Error
            ? error.message
            : 'Something went wrong. Please try again.';
      } finally {
        setCartBusy(false);
      }
    };

    /** @param {KeyboardEvent} event */
    const handleKeyDown = (event) => {
      if (
        event.key === 'Escape' &&
        modal.getAttribute('aria-hidden') === 'false'
      ) {
        closeModal();
      }

      const cartPanel = grid.querySelector('[data-gift-guide-cart]');
      if (event.key === 'Escape' && cartPanel?.getAttribute('aria-hidden') === 'false') {
        cartPanel.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('gift-guide-modal-open');
        previouslyFocused?.focus();
      }
      const activeDialog = grid.querySelector('.gift-guide-modal[aria-hidden="false"], .gift-guide-cart[aria-hidden="false"]');
      if (event.key === 'Tab' && activeDialog) {
        const controls = [...activeDialog.querySelectorAll('button:not(:disabled), a[href], summary')]
          .filter((element) => element instanceof HTMLElement && element.getClientRects().length);
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first && last instanceof HTMLElement) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last && first instanceof HTMLElement) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    /** @param {Event} event */
    const handleCartClick = async (event) => {
      if (!(event.target instanceof Element)) return;
      const panel = grid.querySelector('[data-gift-guide-cart]');
      if (!(panel instanceof HTMLElement)) return;

      if (event.target.closest('[data-gift-guide-cart-close]')) {
        panel.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('gift-guide-modal-open');
        previouslyFocused?.focus();
        return;
      }

      const removeButton = event.target.closest('[data-gift-guide-remove]');
      if (!(removeButton instanceof HTMLButtonElement)) return;
      const key = removeButton.dataset.giftGuideRemove;
      if (!key || cartBusy) return;

      setCartBusy(true);
      try {
        await removeCartLine(panel, key);
        if (panel.getAttribute('aria-hidden') === 'false') {
          const closeButton = panel.querySelector('button[data-gift-guide-cart-close]');
          if (closeButton instanceof HTMLElement) closeButton.focus();
        }
      } catch (error) {
        const notice = panel.querySelector('[data-gift-guide-cart-notice]');
        if (notice instanceof HTMLElement) {
          notice.textContent = error instanceof Error ? error.message : 'This item could not be removed.';
          notice.hidden = false;
        }
      } finally {
        setCartBusy(false);
      }
    };

    const { signal } = listeners;
    grid.addEventListener('click', handleProductClick, { signal });
    modal.addEventListener('click', handleOptionClick, { signal });
    modal.addEventListener('submit', handleAddToCart, { signal });
    document.addEventListener('keydown', handleKeyDown, { signal });
    grid.querySelector('[data-gift-guide-cart]')?.addEventListener('click', handleCartClick, { signal });

    return {
      destroy() {
        listeners.abort();
        productRequest?.abort();
        modal.setAttribute('aria-hidden', 'true');
        grid.querySelector('[data-gift-guide-cart]')?.setAttribute('aria-hidden', 'true');
        if (!document.querySelector('.gift-guide-modal[aria-hidden="false"], .gift-guide-cart[aria-hidden="false"]')) {
          document.body.classList.remove('gift-guide-modal-open');
        }
      }
    };
  };

  /** @type {WeakMap<HTMLElement, { destroy: () => void }>} */
  const controllers = new WeakMap();

  /** @param {ParentNode} [root] */
  const initialize = (root = document) => {
    root.querySelectorAll('[data-gift-guide-grid]').forEach((grid) => {
      if (!(grid instanceof HTMLElement) || controllers.has(grid)) return;
      const controller = createGiftGuideController(grid);
      if (controller) controllers.set(grid, controller);
    });
  };

  document.addEventListener('shopify:section:load', (event) => {
    if (event.target instanceof HTMLElement) initialize(event.target);
  });
  document.addEventListener('shopify:section:unload', (event) => {
    if (!(event.target instanceof HTMLElement)) return;
    event.target.querySelectorAll('[data-gift-guide-grid]').forEach((grid) => {
      if (!(grid instanceof HTMLElement)) return;
      controllers.get(grid)?.destroy();
      controllers.delete(grid);
    });
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initialize(), { once: true });
  } else {
    initialize();
  }
})();
