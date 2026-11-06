/**
 * Avoid late font swaps on the unified Chinese body font.
 *
 * Noto Serif SC is split into many unicode-range subsets. With `swap`, each
 * subset can replace the fallback after first paint and make text twitch.
 * `optional` lets the browser keep the fallback for the current load when the
 * subset is not ready, then use the cached font on later visits.
 */
export default {
  plugins: [
    {
      postcssPlugin: 'font-display-optional-noto',
      Declaration(decl) {
        if (decl.prop !== 'font-display' || decl.value !== 'swap') return
        const rule = decl.parent
        if (!rule || rule.type !== 'atrule' || rule.name !== 'font-face') return
        const family = rule.nodes?.find(
          node => node.type === 'decl' && node.prop === 'font-family',
        )
        if (family && /Noto Serif SC/i.test(family.value)) {
          decl.value = 'optional'
        }
      },
    },
  ],
}