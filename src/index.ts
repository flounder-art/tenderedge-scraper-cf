import { createClient } from '@supabase/supabase-js';
import * as cheerio from 'cheerio';

const CF_URL = 'https://www.contractsfinder.service.gov.uk/Search/Results';
const FT_URL = 'https://www.find-tender.service.gov.uk/Search/Results';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function scrapeContractsFinder() {
  const results: any[] = [];
  let pageNum = 1;

  while (pageNum <= 20) {
    const url = `${CF_URL}?page=${pageNum}&status=Open`;
    console.log(`CF Page ${pageNum}`);

    const res = await fetch(url);
    const html = await res.text();
    const $ = cheerio.load(html);

    $('.search-result').each((i, el) => {
      const title = $(el).find('h2 a').text().trim();
      const href = $(el).find('h2 a').attr('href');
      const buyer = $(el).find('.search-result-sub-header').text().trim();
      const summary = $(el).find('.wrap-text').first().text().trim();

      let deadline = null, value = null, published = null;
      $(el).find('.search-result-entry').each((j, entry) => {
        const text = $(entry).text();
        if (text.includes('Closing')) deadline = text.replace('Closing', '').trim();
        if (text.includes('Contract value')) value = text.replace('Contract value', '').trim();
        if (text.includes('Publication date')) published = text.replace('Publication date', '').trim();
      });

      if (href) {
        results.push({
          source: 'CF',
          external_id: href.split('/').pop()?.split('?')[0],
          title,
          buyer,
          summary,
          url: href.startsWith('http')? href : `https://www.contractsfinder.service.gov.uk${href}`,
          deadline_raw: deadline,
          value_raw: value,
          published_raw: published,
          cpv_codes: ['85300000']
        });
      }
    });

    console.log(`CF Page ${pageNum}: ${$('.search-result').length} results`);
    if ($('.search-result').length === 0) break;
    pageNum++;
    await new Promise(r => setTimeout(r, 1000));
  }
  return results;
}

async function scrapeFindTender() {
  const res = await fetch(`${FT_URL}?status=Open`);
  const html = await res.text();
  const $ = cheerio.load(html);
  const results: any[] = [];

  $('.search-result').each((i, el) => {
    const title = $(el).find('h2 a').text().trim();
    const href = $(el).find('h2 a').attr('href');
    const buyer = $(el).find('.search-result-sub-header').text().trim();

    if (href) {
      results.push({
        source: 'FTN',
        external_id: href.split('/').pop()?.split('?')[0],
        title,
        buyer,
        url: href.startsWith('http')? href : `https://www.find-tender.service.gov.uk${href}`,
        cpv_codes: ['85300000']
      });
    }
  });
  console.log(`FT: ${results.length} results`);
  return results;
}

async function main() {
  console.log('Starting scrape...');
  const cf = await scrapeContractsFinder();
  const ft = await scrapeFindTender();
  const all = [...cf,...ft];

  console.log(`Total: ${all.length}. CF: ${cf.length}, FT: ${ft.length}`);

  let upserted = 0, errors = 0;
  for (const t of all) {
    const { error } = await supabase.from('tenders').upsert(t, { onConflict: 'source,external_id' });
    if (error) {
      console.error(`Upsert error [${t.title}]:`, error.message);
      errors++;
    } else {
      upserted++;
    }
  }
  console.log(`Scrape complete. Upserted: ${upserted}, Errors: ${errors}, Total: ${all.length}`);
}

main();
