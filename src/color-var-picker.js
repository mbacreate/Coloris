/*!
 * Copyright (c) 2021 Momo Bassit.
 * Licensed under the MIT License (MIT)
 * https://github.com/mdbassit/ColorVarPicker
 */

((window, document, Math) => {
  const ctx = document.createElement('canvas').getContext('2d');
  const currentColor = { r: 0, g: 0, b: 0, h: 0, s: 0, v: 0, a: 1 };
  let container, picker, colorValue, currentEl, currentFormat, oldColor;

  // Default settings
  const settings = {
    el: '[data-coloris]',
    parent: 'body',
    theme: 'default',
    themeMode: 'light',
    forceVariables: true,
    wrap: true,
    margin: 2,
    format: 'hex',
    formatToggle : false,
    swatches: [],
    swatchesOnly: true,
    alpha: true,
    forceAlpha: false,
    focusInput: false,
    selectInput: false,
    inline: false,
    defaultColor: '#000000',
  };

  // Virtual instances cache
  const instances = {};
  let currentInstanceId = '';
  let defaultInstance = {};
  let hasInstance = false;

  /**
   * Configure the color picker.
   * @param {object} options Configuration options.
   */
  function configure(options) {
    if (typeof options !== 'object') {
      return;
    }

    for (const key in options) {
      switch (key) {
        case 'el':
          bindFields(options.el);
          if (options.wrap !== false) {
            wrapFields(options.el);
          }
          break;
        case 'parent':
          container = document.querySelector(options.parent);
          if (container) {
            container.appendChild(picker);
            settings.parent = options.parent;

            // document.body is special
            if (container === document.body) {
              container = null;
            }
          }
          break;
        case 'themeMode':
          settings.themeMode = options.themeMode;
          if (options.themeMode === 'auto' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            settings.themeMode = 'dark';
          }
          // The lack of a break statement is intentional
        case 'theme':
          if (options.theme) {
            settings.theme = options.theme;
          }

          // Set the theme and color scheme
          picker.className = `color-var-picker-picker color-var-picker-${settings.theme} color-var-picker-${settings.themeMode}`;

          // Update the color picker's position if inline mode is in use
          if (settings.inline) {
            updatePickerPosition();
          }
          break;
        case 'margin':
          options.margin *= 1;
          settings.margin = !isNaN(options.margin) ? options.margin : settings.margin;
          break;
        case 'wrap':
          if (options.el && options.wrap) {
            wrapFields(options.el);
          }
          break;
        case 'formatToggle':
          settings.formatToggle = !!options.formatToggle;
          getEl('color-var-picker-format').style.display = settings.formatToggle ? 'block' : 'none';
          if (settings.formatToggle) {
            settings.format = 'auto';
          }
          break;
        case 'swatches':
          if (Array.isArray(options.swatches)) {
            const swatchPanels = [];
            options.swatches.forEach((panel, i) => {
              const values = [];
  
              panel.values.forEach((swatch, j) => {
                const { isCSSVar, cssVar } = checkIfCSSVar(swatch);
                let validVariable = true;
                if(isCSSVar) {
                  validVariable = checkIsValidCssColor(getCSSVar(cssVar));
                }
                if(validVariable) {
                  values.push(`<button type="button" ` + (!isCSSVar ? `class="color-var-picker-no-variable"` : ``) + ` id="color-var-picker-swatch-${i}-${j}" aria-labelledby="color-var-picker-swatch-label color-var-picker-swatch-${i}-${j}" style="color: ${swatch};">${swatch}</button>`);
                }
              });

              swatchPanels.push(`<div id="color-var-picker-swatch-panel-${i}" class="color-var-picker-swatch-panel"><div class="color-var-picker-swatch-panel-title">${panel.name}</div><div id="color-var-picker-swatch-panel-${i}-swatches">${values.join('')}</div></div>`);
  
            })
            getEl('color-var-picker-swatches-panels').innerHTML = swatchPanels.length ? `<div class="color-var-picker-swatch-panel-wrapper">${swatchPanels.join('')}</div>` : '';
            settings.swatches = options.swatches.slice();
          }
          break;
        case 'swatchesOnly':
          settings.swatchesOnly = !!options.swatchesOnly;
          picker.setAttribute('data-minimal', settings.swatchesOnly);
          break;
        case 'forceVariables':
          settings.forceVariables = !!options.forceVariables;
          picker.setAttribute('data-pure-variables', settings.forceVariables);
          break;
        case 'alpha':
          settings.alpha = !!options.alpha;
          picker.setAttribute('data-alpha', settings.alpha);
          break;
        case 'inline':
          settings.inline = !!options.inline;
          picker.setAttribute('data-inline', settings.inline);

          if (settings.inline) {
            const defaultColor = options.defaultColor || settings.defaultColor;
            
            currentFormat = getColorFormatFromStr(defaultColor);
            updatePickerPosition();
            setColorFromStr(defaultColor);
          }
          break;
        default:
          settings[key] = options[key];
      }
    }
  }

  /**
   * Add or update a virtual instance.
   * @param {String} selector The CSS selector of the elements to which the instance is attached.
   * @param {Object} options Per-instance options to apply.
   */
  function setVirtualInstance(selector, options) {
    if (typeof selector === 'string' && typeof options === 'object') {
      instances[selector] = options;
      hasInstance = true;
    }
  }

  /**
   * Remove a virtual instance.
   * @param {String} selector The CSS selector of the elements to which the instance is attached.
   */
  function removeVirtualInstance(selector) {
    delete instances[selector];

    if (Object.keys(instances).length === 0) {
      hasInstance = false;

      if (selector === currentInstanceId) {
        resetVirtualInstance();
      }
    }
  }

  /**
   * Attach a virtual instance to an element if it matches a selector.
   * @param {Object} element Target element that will receive a virtual instance if applicable.
   */
  function attachVirtualInstance(element) {
    if (hasInstance) {
      // These options can only be set globally, not per instance
      const unsupportedOptions = ['el', 'wrap', 'inline', 'defaultColor'];

      for (let selector in instances) {
        const options = instances[selector];

        // If the element matches an instance's CSS selector
        if (element.matches(selector)) {
          currentInstanceId = selector;
          defaultInstance = {};

          // Delete unsupported options
          unsupportedOptions.forEach(option => delete options[option]);

          // Back up the default options so we can restore them later
          for (let option in options) {
            defaultInstance[option] = Array.isArray(settings[option]) ? settings[option].slice() : settings[option];
          }

          // Set the instance's options
          configure(options);
          break;
        }
      }
    }
  }

  /**
   * Revert any per-instance options that were previously applied.
   */
  function resetVirtualInstance() {
    if (Object.keys(defaultInstance).length > 0) {
      configure(defaultInstance);
      currentInstanceId = '';
      defaultInstance = {};
    }
  }

  /**
   * Bind the color picker to input fields that match the selector.
   * @param {string} selector One or more selectors pointing to input fields.
   */
  function bindFields(selector) {
    // Show the color picker on click on the input fields that match the selector
    addListener(document, 'click', selector, event => {
      // Skip if inline mode is in use
      if (settings.inline) {
        return;
      }

      // Apply any per-instance options first
      attachVirtualInstance(event.target);

      currentEl = event.target;
      oldColor = currentEl.value;
      currentFormat = getColorFormatFromStr(oldColor);
      picker.classList.add('color-var-picker-open');
      
      updatePickerPosition();
      setColorFromStr(oldColor);

      if (settings.focusInput || settings.selectInput) {
        colorValue.focus({ preventScroll: true });
      }
      
      if (settings.selectInput) {
        colorValue.select();
      }

      // Trigger an "open" event
      currentEl.dispatchEvent(new Event('open', { bubbles: true }));
    });

    // Update the color preview of the input fields that match the selector
    addListener(document, 'input', selector, event => {
      const parent = event.target.parentNode;

      // Only update the preview if the field has been previously wrapped
      if (parent.classList.contains('color-var-picker-field')) {
        parent.style.color = event.target.value;
        //parent.style.background = event.target.value;
      }
    });
  }

  /**
   * Update the color picker's position and the color gradient's offset
   */
  function updatePickerPosition() {
    const parent = container;
    const scrollY = window.scrollY;
    const pickerWidth = picker.offsetWidth;
    const pickerHeight = picker.offsetHeight;
    const reposition = { left: false, top: false };
    let parentStyle, parentMarginTop, parentBorderTop;
    let offset = { x: 0, y: 0 };

    if (parent) {
      parentStyle = window.getComputedStyle(parent);
      parentMarginTop = parseFloat(parentStyle.marginTop);
      parentBorderTop = parseFloat(parentStyle.borderTopWidth);

      offset = parent.getBoundingClientRect();
      offset.y += parentBorderTop + scrollY;
    }

    if (!settings.inline) {
      const coords = currentEl.getBoundingClientRect();
      let left = coords.x;
      let top = scrollY + coords.y + coords.height + settings.margin;

      // If the color picker is inside a custom container
      // set the position relative to it
      if (parent) {
        left -= offset.x;
        top -= offset.y;

        if (left + pickerWidth > parent.clientWidth) {
          left += coords.width - pickerWidth;
          reposition.left = true;
        }

        if (top + pickerHeight >  parent.clientHeight - parentMarginTop) {
          if (pickerHeight + settings.margin <= coords.top - (offset.y - scrollY)) {
            top -= coords.height + pickerHeight + settings.margin * 2;
            reposition.top = true;
          }
        }

        top += parent.scrollTop;

      // Otherwise set the position relative to the whole document
      } else {
        if (left + pickerWidth > document.documentElement.clientWidth) {
          left += coords.width - pickerWidth;
          reposition.left = true;
        }

        if (top + pickerHeight - scrollY > document.documentElement.clientHeight) {
          if (pickerHeight + settings.margin <= coords.top) {
            top = scrollY + coords.y - pickerHeight - settings.margin;
            reposition.top = true;
          }
        }
      }

      picker.classList.toggle('color-var-picker-left', reposition.left);
      picker.classList.toggle('color-var-picker-top', reposition.top);
      picker.style.left = `${left}px`;
      picker.style.top = `${top}px`;
    }
    
  }

  /**
   * Wrap the linked input fields in a div that adds a color preview.
   * @param {string} selector One or more selectors pointing to input fields.
   */
  function wrapFields(selector) {
    document.querySelectorAll(selector).forEach(field => {
      const parentNode = field.parentNode;

      if (!parentNode.classList.contains('color-var-picker-field')) {
        const wrapper = document.createElement('div');

        wrapper.innerHTML = `<button type="button" aria-labelledby="color-var-picker-open-label"></button>`;
        parentNode.insertBefore(wrapper, field);
        wrapper.setAttribute('class', 'color-var-picker-field');
        //if(parentNode.classList.contains('full')){
        //  wrapper.style.background = field.value;
        //} else {  
          wrapper.style.color = field.value;
        //}
        //wrapper.style.color = field.value;
        wrapper.appendChild(field);
      }
    });
  }

  /**
   * Close the color picker.
   * @param {boolean} [revert] If true, revert the color to the original value.
   */
  function closePicker(revert) {
    if (currentEl && !settings.inline) {
      const prevEl = currentEl;

      // Revert the color to the original value if needed
      if (revert) {
        // This will prevent the "change" event on the colorValue input to execute its handler
        currentEl = null;

        if (oldColor !== prevEl.value) {
          prevEl.value = oldColor;

          // Trigger an "input" event to force update the thumbnail next to the input field
          prevEl.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }

      // Trigger a "change" event if needed
      setTimeout(() => { // Add this to the end of the event loop
        if (oldColor !== prevEl.value) {
          prevEl.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });

      // Hide the picker dialog
      picker.classList.remove('color-var-picker-open');

      // Reset any previously set per-instance options
      if (hasInstance) {
        resetVirtualInstance();
      }

      // Trigger a "close" event
      prevEl.dispatchEvent(new Event('close', { bubbles: true }));

      if (settings.focusInput) {
        prevEl.focus({ preventScroll: true });
      }

      // This essentially marks the picker as closed
      currentEl = null;
    }
  }

  /**
   * Set the active color from a string.
   * @param {string} str String representing a color.
   */
  function setColorFromStr(str) {
    const { isCSSVar, cssVar } = checkIfCSSVar(str);
    const fullStr = isCSSVar ? getCSSVar(cssVar) : str;


    const rgba = strToRGBA(fullStr);
    const hsva = RGBAtoHSVA(rgba);

    updateColor(rgba, hsva);

    // Update the UI
    picker.style.color = `hsl(${hsva.h}, 100%, 50%)`;

  }

  /**
   * Guess the color format from a string.
   * @param {string} str String representing a color.
   * @return {string} The color format.
   */
  function getColorFormatFromStr(str) {
    const format = str.substring(0, 3).toLowerCase();

    if (format === 'rgb' || format === 'hsl' ) {
      return format;
    }

    return 'hex';
  }

  /**
   * Copy the active color to the linked input field.
   * @param {number} [color] Color value to override the active color.
   */
  function pickColor(color) {
    color = color !== undefined ? color : colorValue.value;

    if (currentEl) {
      currentEl.value = color;
      currentEl.dispatchEvent(new Event('input', { bubbles: true }));
    }

    document.dispatchEvent(new CustomEvent('picker:pick', { detail: { color } }));
  }


  /**
   * Update the color picker's input field and preview thumb.
   * @param {Object} rgba Red, green, blue and alpha values.
   * @param {Object} [hsva] Hue, saturation, value and alpha values.
   */
  function updateColor(rgba = {}, hsva = {}) {
    let format = settings.format;

    for (const key in rgba) {
      currentColor[key] = rgba[key];
    }

    for (const key in hsva) {
      currentColor[key] = hsva[key];
    }

    const hex = RGBAToHex(currentColor);
    const opaqueHex = hex.substring(0, 7);

    if (format === 'mixed') {
      format = currentColor.a === 1 ? 'hex' : 'rgb';
    } else if (format === 'auto') {
      format = currentFormat;
    }

    switch (format) {
      case 'hex':
        colorValue.value = hex;
        break;
      case 'rgb':
        colorValue.value = RGBAToStr(currentColor);
        break;
      case 'hsl':
        colorValue.value = HSLAToStr(HSVAtoHSLA(currentColor));
        break;
    }

  }


  /**
   * Convert HSVA to RGBA.
   * @param {object} hsva Hue, saturation, value and alpha values.
   * @return {object} Red, green, blue and alpha values.
   */
  function HSVAtoRGBA(hsva) {
    const saturation = hsva.s / 100;
    const value = hsva.v / 100;
    let chroma = saturation * value;
    let hueBy60 = hsva.h / 60;
    let x = chroma * (1 - Math.abs(hueBy60 % 2 - 1));
    let m = value - chroma;

    chroma = (chroma + m);
    x = (x + m);

    const index = Math.floor(hueBy60) % 6;
    const red = [chroma, x, m, m, x, chroma][index];
    const green = [x, chroma, chroma, x, m, m][index];
    const blue = [m, m, x, chroma, chroma, x][index];

    return {
      r: Math.round(red * 255),
      g: Math.round(green * 255),
      b: Math.round(blue * 255),
      a: hsva.a
    };
  }

  /**
   * Convert HSVA to HSLA.
   * @param {object} hsva Hue, saturation, value and alpha values.
   * @return {object} Hue, saturation, lightness and alpha values.
   */
  function HSVAtoHSLA(hsva) {
    const value = hsva.v / 100;
    const lightness = value * (1 - (hsva.s / 100) / 2);
    let saturation;

    if (lightness > 0 && lightness < 1) {
      saturation = Math.round((value - lightness) / Math.min(lightness, 1 - lightness) * 100);
    }

    return {
      h: hsva.h,
      s: saturation || 0,
      l: Math.round(lightness * 100),
      a: hsva.a
    };
  }

  /**
   * Convert RGBA to HSVA.
   * @param {object} rgba Red, green, blue and alpha values.
   * @return {object} Hue, saturation, value and alpha values.
   */
  function RGBAtoHSVA(rgba) {
    const red   = rgba.r / 255;
    const green = rgba.g / 255;
    const blue  = rgba.b / 255;
    const xmax = Math.max(red, green, blue);
    const xmin = Math.min(red, green, blue);
    const chroma = xmax - xmin;
    const value = xmax;
    let hue = 0;
    let saturation = 0;

    if (chroma) {
      if (xmax === red ) { hue = ((green - blue) / chroma); }
      if (xmax === green ) { hue = 2 + (blue - red) / chroma; }
      if (xmax === blue ) { hue = 4 + (red - green) / chroma; }
      if (xmax) { saturation = chroma / xmax; }
    }

    hue = Math.floor(hue * 60);

    return {
      h: hue < 0 ? hue + 360 : hue,
      s: Math.round(saturation * 100),
      v: Math.round(value * 100),
      a: rgba.a
    };
  }

  /**
   * Check if string is CSS variable.
   * @param {string} str String in the format var(--variable-name).
   * @return {boolean} is CSS variable true or false.
   */
  function checkIfCSSVar(str) {
    const regex = /^var\((--.+)\)$/i;
    const match = regex.exec(str);
    return { isCSSVar: match?.length > 0, cssVar: match?.[1]};
  }

  /**
   * Get string from CSS variable.
   * @param {string} cssVar String in the format var(--variable-name).
   * @return {string} String representing a color.
   */
  function getCSSVar(cssVar) {
    if (window.getComputedStyle) {
      return window.getComputedStyle(document.documentElement).getPropertyValue(cssVar)?.trim() || cssVar;
    } else {
      return null;
    }
  }

  /**
   * Check if string is a valid color.
   * @param {string} str String representing a cssVar value.
   * @return {boolean} Valid color true or false.
   */
  function checkIsValidCssColor(str) {
    return CSS.supports('color',str)
  }

  /**
   * Parse a string to RGBA.
   * @param {string} str String representing a color.
   * @return {object} Red, green, blue and alpha values.
   */
  function strToRGBA(str) {
    const regex = /^((rgba)|rgb)[\D]+([\d.]+)[\D]+([\d.]+)[\D]+([\d.]+)[\D]*?([\d.]+|$)/i;
    let match, rgba;

    // Default to black for invalid color strings
    ctx.fillStyle = '#000';

    // Use canvas to convert the string to a valid color string
    ctx.fillStyle = str;
    match = regex.exec(ctx.fillStyle);

    if (match) {
      rgba = {
        r: match[3] * 1,
        g: match[4] * 1,
        b: match[5] * 1,
        a: match[6] * 1
      };

      // Workaround to mitigate a Chromium bug where the alpha value is rounded incorrectly
      rgba.a = +rgba.a.toFixed(2);

    } else {
      match = ctx.fillStyle.replace('#', '').match(/.{2}/g).map(h => parseInt(h, 16));
      rgba = {
        r: match[0],
        g: match[1],
        b: match[2],
        a: 1
      };
    }

    return rgba;
  }

  /**
   * Convert RGBA to Hex.
   * @param {object} rgba Red, green, blue and alpha values.
   * @return {string} Hex color string.
   */
  function RGBAToHex(rgba) {
    let R = rgba.r.toString(16);
    let G = rgba.g.toString(16);
    let B = rgba.b.toString(16);
    let A = '';

    if (rgba.r < 16) {
      R = '0' + R;
    }

    if (rgba.g < 16) {
      G = '0' + G;
    }

    if (rgba.b < 16) {
      B = '0' + B;
    }

    if (settings.alpha && (rgba.a < 1 || settings.forceAlpha)) {
      const alpha = rgba.a * 255 | 0;
      A = alpha.toString(16);

      if (alpha < 16) {
        A = '0' + A;
      }
    }

    return '#' + R + G + B + A;
  }

  /**
   * Convert RGBA values to a CSS rgb/rgba string.
   * @param {object} rgba Red, green, blue and alpha values.
   * @return {string} CSS color string.
   */
  function RGBAToStr(rgba) {
    if (!settings.alpha || (rgba.a === 1 && !settings.forceAlpha)) {
      return `rgb(${rgba.r}, ${rgba.g}, ${rgba.b})`;
    } else {
      return `rgba(${rgba.r}, ${rgba.g}, ${rgba.b}, ${rgba.a})`;
    }
  }

  /**
   * Convert HSLA values to a CSS hsl/hsla string.
   * @param {object} hsla Hue, saturation, lightness and alpha values.
   * @return {string} CSS color string.
   */
  function HSLAToStr(hsla) {
    if (!settings.alpha || (hsla.a === 1 && !settings.forceAlpha)) {
      return `hsl(${hsla.h}, ${hsla.s}%, ${hsla.l}%)`;
    } else {
      return `hsla(${hsla.h}, ${hsla.s}%, ${hsla.l}%, ${hsla.a})`;
    }
  }

  /**
   * Init the color picker.
   */
  function init() {
    // Render the UI
    container = null;
    picker = document.createElement('div');
    picker.setAttribute('id', 'color-var-picker-picker');
    picker.setAttribute('data-pure-variables', settings.forceVariables);
    picker.className = 'color-var-picker-picker';
    picker.innerHTML = 
    `<div id="color-var-picker-color-value" class="color-var-picker-color" type="text" value="" spellcheck="false" aria-label="color-variable-picker"></div>`+
    '<div id="color-var-picker-swatches-panels" class="color-var-picker-swatches-panels"></div>';

    // Append the color picker to the DOM
    document.body.appendChild(picker);

    // Reference the UI elements
    colorValue = getEl('color-var-picker-color-value');

    // Bind the picker to the default selector
    bindFields(settings.el);
    wrapFields(settings.el);

    addListener(picker, 'mousedown', event => {
      picker.classList.remove('color-var-picker-keyboard-nav');
      event.stopPropagation();
    });

    addListener(colorValue, 'change', event => {
      if (currentEl || settings.inline) {
        setColorFromStr(colorValue.value);
        pickColor();
      }
    });

    addListener(document, 'click', '.color-var-picker-format input', event => {
      currentFormat = event.target.value;
      updateColor();
      pickColor();
    });

    addListener(picker, 'click', '.color-var-picker-swatches-panels button', event => {
      setColorFromStr(event.target.textContent);
      pickColor();

      if (settings.swatchesOnly) {
        closePicker();
      }
    });

    addListener(document, 'mousedown', event => {
      picker.classList.remove('color-var-picker-keyboard-nav');
      closePicker();
    });

    addListener(document, 'keydown', event => {
      const navKeys = ['Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

      if (event.key === 'Escape') {
        closePicker(true);

      // Display focus rings when using the keyboard
      } else if (navKeys.includes(event.key)) {
        picker.classList.add('color-var-picker-keyboard-nav');
      }
    });

    addListener(document, 'click', '.color-var-picker-field button', event => {
      // Reset any previously set per-instance options
      if (hasInstance) {
        resetVirtualInstance();
      }

      // Open the color picker
      event.target.nextElementSibling.dispatchEvent(new Event('click', { bubbles: true }));
    });

  }

  /**
   * Shortcut for getElementById to optimize the minified JS.
   * @param {string} id The element id.
   * @return {object} The DOM element with the provided id.
   */
  function getEl(id) {
    return document.getElementById(id);
  }

  /**
   * Shortcut for addEventListener to optimize the minified JS.
   * @param {object} context The context to which the listener is attached.
   * @param {string} type Event type.
   * @param {(string|function)} selector Event target if delegation is used, event handler if not.
   * @param {function} [fn] Event handler if delegation is used.
   */
  function addListener(context, type, selector, fn) {
    const matches = Element.prototype.matches || Element.prototype.msMatchesSelector;

    // Delegate event to the target of the selector
    if (typeof selector === 'string') {
      context.addEventListener(type, event => {
        if (matches.call(event.target, selector)) {
          fn.call(event.target, event);
        }
      });

    // If the selector is not a string then it's a function
    // in which case we need regular event listener
    } else {
      fn = selector;
      context.addEventListener(type, fn);
    }
  }

  /**
   * Call a function only when the DOM is ready.
   * @param {function} fn The function to call.
   * @param {array} [args] Arguments to pass to the function.
   */
  function DOMReady(fn, args) {
    args = args !== undefined ? args : [];

    if (document.readyState !== 'loading') {
      fn(...args);
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        fn(...args);
      });
    }
  }

  // Polyfill for Nodelist.forEach
  if (NodeList !== undefined && NodeList.prototype && !NodeList.prototype.forEach) {
      NodeList.prototype.forEach = Array.prototype.forEach;
  }

  // Expose the color picker to the global scope
  window.ColorVarPicker = (() => {
    const methods = {
      set: configure,
      wrap: wrapFields,
      close: closePicker,
      setInstance: setVirtualInstance,
      removeInstance: removeVirtualInstance,
      updatePosition: updatePickerPosition
    };

    function ColorVarPicker(options) {
      DOMReady(() => {
        if (options) {
          if (typeof options === 'string') {
            bindFields(options);
          } else {
            configure(options);
          }
        }
      });
    }

    for (const key in methods) {
      ColorVarPicker[key] = (...args) => {
        DOMReady(methods[key], args);
      };
    }

    return ColorVarPicker;
  })();

  // Init the color picker when the DOM is ready
  DOMReady(init);

})(window, document, Math);
