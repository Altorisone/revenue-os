// lib/connectors/jobboard-discovery.ts
// Discovers DACH companies actively hiring via Stepstone & Indeed RSS feeds.

const HR_QUERIES = [
  'HR Manager', 'Personalreferent', 'Recruiter', 'Talent Acquisition',
  'Personalleiter', 'HR Business Partner', 'Sachbearbeiter Personal', 'People Operations',
]

interface JobPosting {
  company: string; jobTitle: string; link: string; pubDate?: string; source: string
}

function extractCompanyFromTitle(title: string): string | null {
  const beiMatch = title.match(/ bei (.+?)(?:\s*[-|,]|$)/i)
  if (beiMatch) return beiMatch[1].trim()
  const dashParts = title.split(' - ')
  if (dashParts.length >= 2) {
    const c = dashParts[1].trim()
    if (c.length > 1 && c.length < 70) return c
  }
  const pipeParts = title.split(' | ')
  if (pipeParts.length >= 2) return pipeParts[1].trim()
  return null
}

function parseRSSJobs(xml: string, source: string): JobPosting[] {
  const items: JobPosting[] = []
  const itemRe = /<item>([\s\S]*?)<\/item>/g
  let m
  while ((m = itemRe.exec(xml)) !== null) {
    const c = m[1]
    const titleM   = c.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/)
    const linkM    = c.match(/<link>(.*?)<\/link>|<guid[^>]*>(https?:\/\/[^<]+)<\/guid>/)
    const dateM    = c.match(/<pubDate>(.*?)<\/pubDate>/)
    const authorM  = c.match(/<author>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/author>/)
    const empM     = c.match(/<(?:company|employer)>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/(?:company|employer)>/)
    const rawTitle = (titleM?.[1] ?? '').trim()
    if (!rawTitle) continue
    let company = empM?.[1]?.trim() ||
      (authorM?.[1]?.includes('@') ? null : authorM?.[1]?.trim()) ||
      extractCompanyFromTitle(rawTitle)
    if (!company || company.length < 2 || company.length > 80) continue
    items.push({ company, jobTitle: rawTitle, link: (linkM?.[1] || linkM?.[2] || '').trim(), pubDate: dateM?.[1], source })
  }
  return items.slice(0, 40)
}

async function fetchFeed(url: string, source: string): Promise<JobPosting[]> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RevenueOS/1.0)', 'Accept': 'application/rss+xml, */*' },
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return []
    return parseRSSJobs(await res.text(), source)
  } catch { return [] }
}

async function fetchJobboardResults(query: string): Promise<JobPosting[]> {
  const q = encodeURIComponent(query)
  const [stepstone, indeed, xing] = await Promise.all([
    fetchFeed(`https://www.stepstone.de/rss/alle-jobs/?q=${q}&where=Deutschland&radius=100`, 'Stepstone'),
    fetchFeed(`https://de.indeed.com/rss?q=${q}&l=Deutschland&sort=date&fromage=14`, 'Indeed'),
    fetchFeed(`https://www.xing.com/jobs/search/rss?q=${q}&location=Deutschland`, 'Xing'),
  ])
  return [...stepstone, ...indeed, ...xing]
}

function normalizeCompanyName(name: string): string {
  return name.toLowerCase()
    .replace(/\b(gmbh|ag|se|kg|ohg|gbr|ltd|inc|corp|s\.a\.|bv|nv|ug|e\.v\.|ev|co\.)\b/gi, '')
    .replace(/[^a-zäöü0-9]/g, '').trim()
}

const SKIP_NAMES = new Set(['personalvermittlung','zeitarbeit','headhunter','jobborse','stellenanzeigen'])

export async function runJobboardDiscovery(
  supabase: any, projectId: string,
): Promise<{ candidatesCreated: number; jobsScanned: number }> {

  const { data: marker } = await supabase
    .from('discovery_searches').select('id, next_run_at')
    .eq('project_id', projectId).eq('signal_type', 'jobboard_scan').maybeSingle()

  const now = new Date()
  if (marker) {
    if (marker.next_run_at && new Date(marker.next_run_at) > now)
      return { candidatesCreated: 0, jobsScanned: 0 }
  } else {
    await supabase.from('discovery_searches').insert({
      project_id: projectId, query: 'jobboard_scan', signal_type: 'jobboard_scan',
      enabled: true, next_run_at: new Date(now.getTime() + 12 * 3600 * 1000).toISOString(),
    })
  }

  const allPostings: JobPosting[] = []
  for (const query of HR_QUERIES) {
    allPostings.push(...await fetchJobboardResults(query))
    await new Promise(r => setTimeout(r, 400))
  }

  const byCompany = new Map<string, { name: string; postings: JobPosting[] }>()
  for (const p of allPostings) {
    const norm = normalizeCompanyName(p.company)
    if (!norm || norm.length < 2 || SKIP_NAMES.has(norm)) continue
    if (!byCompany.has(norm)) byCompany.set(norm, { name: p.company, postings: [] })
    byCompany.get(norm)!.postings.push(p)
  }

  let candidatesCreated = 0
  for (const { name, postings } of byCompany.values()) {
    const normalized = normalizeCompanyName(name)
    const { data: ec } = await supabase.from('candidate_companies').select('id')
      .eq('project_id', projectId).eq('normalized_name', normalized).maybeSingle()
    if (ec) continue
    const { data: eComp } = await supabase.from('companies').select('id')
      .eq('project_id', projectId).ilike('name', name).maybeSingle()
    const confidence = postings.length >= 4 ? 85 : postings.length >= 2 ? 75 : 65
    const evidence = postings.slice(0, 4).map(p => ({
      title: p.jobTitle, link: p.link,
      published: p.pubDate || now.toISOString(), source: p.source,
    }))
    const { error } = await supabase.from('candidate_companies').insert({
      project_id: projectId, name, signal_hint: 'hiring',
      confidence, evidence, status: 'pending', existing_company_id: eComp?.id ?? null,
    })
    if (!error) candidatesCreated++
  }

  const nextRun = new Date(now.getTime() + 12 * 3600 * 1000).toISOString()
  if (marker) {
    await supabase.from('discovery_searches')
      .update({ next_run_at: nextRun, last_run_at: now.toISOString() }).eq('id', marker.id)
  }
  return { candidatesCreated, jobsScanned: allPostings.length }
}
