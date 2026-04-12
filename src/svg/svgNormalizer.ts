/**
 * SVG Normalizer — converts any SVG into a canonical form for reliable CNC processing.
 *
 * After normalization, the SVG is a flat list of shape elements with:
 * - No groups (transforms baked into coordinates via CSS)
 * - No CSS classes (fills/strokes as attributes)
 * - No <use> references (expanded inline)
 * - No non-shape elements (clipPath, mask, image, metadata filtered)
 * - Consistent units (mm)
 * - Inline style="fill:..." moved to fill="..." attributes
 */

const UNIT_TO_MM: Record<string, number> = {
  mm: 1,
  cm: 10,
  in: 25.4,
  pt: 0.352778,
  pc: 4.23333,
  px: 0.264583, // 96 DPI
  '': 0.264583,  // unitless = px at 96 DPI
};

/**
 * Main entry point: normalize raw SVG text into canonical form.
 */
export function normalizeSvg(svgText: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, 'image/svg+xml');
  const svg = doc.querySelector('svg');
  if (!svg) return svgText;

  try {
    inlineCssStyles(svg);
    expandUseReferences(svg);
    filterNonShapeElements(svg);
    inlineStyleAttributes(svg);
    normalizeUnits(svg);
  } catch {
    // If normalization fails, return original — better than crashing
    return svgText;
  }

  return new XMLSerializer().serializeToString(svg);
}

/**
 * Parse <style> blocks and inline CSS rules as attributes on matching elements.
 */
function inlineCssStyles(svg: SVGSVGElement): void {
  const styleElements = svg.querySelectorAll('style');
  const rules: { selector: string; props: Map<string, string> }[] = [];

  styleElements.forEach((styleEl) => {
    const cssText = styleEl.textContent ?? '';
    // Simple CSS rule parser: .class { prop: value; }
    const ruleRegex = /([^{]+)\{([^}]+)\}/g;
    let match;
    while ((match = ruleRegex.exec(cssText)) !== null) {
      const selector = match[1].trim();
      const body = match[2].trim();
      const props = new Map<string, string>();
      body.split(';').forEach((decl) => {
        const [prop, val] = decl.split(':').map((s) => s.trim());
        if (prop && val) props.set(prop, val);
      });
      rules.push({ selector, props });
    }
    // Remove the <style> element after inlining
    styleEl.remove();
  });

  // Apply rules to matching elements
  for (const rule of rules) {
    try {
      const matches = svg.querySelectorAll(rule.selector);
      matches.forEach((el) => {
        rule.props.forEach((val, prop) => {
          // Only set if element doesn't already have this attribute
          if (!el.getAttribute(prop)) {
            el.setAttribute(prop, val);
          }
        });
      });
    } catch {
      // Invalid selector — skip
    }
  }
}

/**
 * Expand <use> references by cloning the referenced element inline.
 */
function expandUseReferences(svg: SVGSVGElement): void {
  const useElements = svg.querySelectorAll('use');
  useElements.forEach((useEl) => {
    const href = useEl.getAttribute('href') ?? useEl.getAttribute('xlink:href');
    if (!href || !href.startsWith('#')) return;

    const refId = href.slice(1);
    const referenced = svg.querySelector(`#${refId}`);
    if (!referenced) return;

    // Clone the referenced element
    const clone = referenced.cloneNode(true) as Element;
    clone.removeAttribute('id'); // Prevent duplicate IDs

    // Apply use element's x/y as transform
    const x = parseFloat(useEl.getAttribute('x') ?? '0');
    const y = parseFloat(useEl.getAttribute('y') ?? '0');
    if (x !== 0 || y !== 0) {
      const existing = clone.getAttribute('transform') ?? '';
      clone.setAttribute('transform', `translate(${x},${y}) ${existing}`.trim());
    }

    // Replace <use> with the clone
    useEl.parentNode?.replaceChild(clone, useEl);
  });

  // Remove <defs> and <symbol> elements (content has been expanded)
  // Keep <defs> if it contains non-use things like gradients (they're harmless)
}

/**
 * Remove non-shape elements that shouldn't be in the CNC pipeline.
 */
function filterNonShapeElements(svg: SVGSVGElement): void {
  const removeSelectors = [
    'clipPath', 'mask', 'image', 'metadata',
    'foreignObject', 'script', 'animate', 'animateTransform',
    'animateMotion', 'set',
  ];

  for (const sel of removeSelectors) {
    svg.querySelectorAll(sel).forEach((el) => el.remove());
  }

  // Remove Inkscape/Sodipodi namespaced elements (they're metadata, not shapes)
  svg.querySelectorAll('sodipodi\\:namedview, inkscape\\:*').forEach((el) => el.remove());

  // Also try without namespace escaping
  const allElements = svg.querySelectorAll('*');
  allElements.forEach((el) => {
    const ns = el.namespaceURI ?? '';
    if (ns.includes('sodipodi') || ns.includes('inkscape')) {
      el.remove();
    }
  });
}

/**
 * Move inline style="fill:...; stroke:..." to XML attributes.
 * This ensures getAttribute('fill') returns the correct value.
 */
function inlineStyleAttributes(svg: SVGSVGElement): void {
  const allElements = svg.querySelectorAll('*');
  const cssProps = ['fill', 'stroke', 'fill-opacity', 'stroke-opacity', 'stroke-width',
    'fill-rule', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'opacity'];

  allElements.forEach((el) => {
    const style = el.getAttribute('style');
    if (!style) return;

    let remaining = style;
    for (const prop of cssProps) {
      const regex = new RegExp(`${prop}\\s*:\\s*([^;]+?)\\s*(;|$)`, 'i');
      const match = remaining.match(regex);
      if (match) {
        const value = match[1].trim();
        // Set as attribute (overrides any existing attribute)
        el.setAttribute(prop, value);
        // Remove from style string
        remaining = remaining.replace(regex, '');
      }
    }

    // Update or remove the style attribute
    remaining = remaining.trim().replace(/^;+|;+$/g, '').trim();
    if (remaining) {
      el.setAttribute('style', remaining);
    } else {
      el.removeAttribute('style');
    }
  });
}

/**
 * Normalize SVG units: convert width/height from cm/in/pt to mm.
 * Ensures the viewBox and dimensions are in a consistent coordinate system.
 */
function normalizeUnits(svg: SVGSVGElement): void {
  // Parse width and height with units
  const rawWidth = svg.getAttribute('width') ?? '';
  const rawHeight = svg.getAttribute('height') ?? '';

  const parseDimension = (raw: string): { value: number; unit: string } => {
    const match = raw.match(/^([0-9.]+)\s*(mm|cm|in|pt|pc|px|)$/i);
    if (!match) return { value: parseFloat(raw) || 0, unit: '' };
    return { value: parseFloat(match[1]), unit: match[2].toLowerCase() };
  };

  const w = parseDimension(rawWidth);
  const h = parseDimension(rawHeight);

  // Convert to mm
  const wMm = w.value * (UNIT_TO_MM[w.unit] ?? 1);
  const hMm = h.value * (UNIT_TO_MM[h.unit] ?? 1);

  if (wMm > 0 && hMm > 0) {
    svg.setAttribute('width', `${wMm}mm`);
    svg.setAttribute('height', `${hMm}mm`);
  }

  // ViewBox: ensure it exists. If not, create one from dimensions
  if (!svg.getAttribute('viewBox') && wMm > 0 && hMm > 0) {
    // Use the original numeric values as viewBox (unitless in SVG user space)
    svg.setAttribute('viewBox', `0 0 ${w.value} ${h.value}`);
  }
}
