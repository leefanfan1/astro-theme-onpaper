export interface FriendLink {
  name: string
  url: string
  description: string
}

/** Each blank-line-separated entry contains a name, URL, and optional description. */
export function parseFriends(content: string): FriendLink[] {
  const text = content
    .replace(/\r\n?/g, '\n')
    .replace(/<!--[\s\S]*?-->/g, '')
    .split('\n').map(line => line.trim()).join('\n')
    .trim()
  if (!text) return []

  return text.split(/\n{2,}/).map((block, index) => {
    const [name, rawUrl, ...description] = block.split('\n')
    if (!name || !rawUrl) {
      throw new Error(`friends.md 第 ${index + 1} 条：请依次填写名称、完整网址和简介，简介可省略。`)
    }
    let url: URL
    try { url = new URL(rawUrl) }
    catch { throw new Error(`friends.md：${name} 的网址不完整，请填写完整网址，例如 https://example.com/。`) }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error(`friends.md：${name} 的网址仅支持 HTTP(S) 协议，请使用 http:// 或 https://。`)
    }
    return { name, url: url.href, description: description.join(' ').trim() }
  })
}
