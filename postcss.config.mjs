/**
 * Keep browser font loading aligned with the complete-page font gate.
 * Never use optional: it can retain fallback text for the entire visit.
 */
export default {
  plugins: [
    {
      postcssPlugin: 'font-display-block-noto',
      Declaration(decl) {
        if (decl.prop !== 'font-display' || decl.value !== 'swap') return
        const rule = decl.parent
        if (!rule || rule.type !== 'atrule' || rule.name !== 'font-face') return
        const family = rule.nodes?.find(
          node => node.type === 'decl' && node.prop === 'font-family',
        )
        if (family && /Noto Serif SC/i.test(family.value)) {
          decl.value = 'block'
        }
      },
    },
  ],
}