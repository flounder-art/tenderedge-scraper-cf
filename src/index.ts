import { createClient } from '@supabase/supabase-js';
import * as cheerio from 'cheerio';
import { mapCpvToTags } from './cpv_registry.js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

const CF_URL = 'https://www.contractsfinder.service.gov.uk/Search/Results';
const FTN_URL = 'https://www.find-tender.service.gov.uk/Search/Results';

async function scrapeContractsFinder() {
  const results: any[] = [];
  let pageNum = 1;
  
  while (pageNum <= 20) {
    const url = `${CF_URL}?page=${pageNum}`;
    console.log(`CF Page ${pageNum}`);
    
    const res = await fetch(url);
    const html = await res.text();
    const $ = cheerio.load(html);
    
    const items = $('.search-result');
    if (items.length === 0) break;
    
    console.log(`CF Page ${pageNum}: ${items.length} results`);
    
    items.each((_, el) => {
      const title = $(el).find('.search-result__title').text().trim();
      const link = $(el).find('.search-result__title a').attr('href');
      const buyer = $(el).find('.search-result__meta dd').eq(0).text().trim();
      const value = $(el).find('.search-result__meta dd').eq(2).text().trim();
      const deadline = $(el).find('.search-result__meta dd').eq(3).text().trim();
      const published = $(el).find('.search-result__meta dd').eq(4).text().trim();
      
      results.push({
        source: 'CF',
        title,
        url: link ? `https://www.contractsfinder.service.gov.uk${link}` : null,
        buyer,
        value_text: value,
        deadline: deadline || null,
        published: published || null,
        cpv_codes: [],
        tags: []
      });
    });
    
    pageNum++;
    await new Promise(r => setTimeout(r, 1000));
  }
  
  return results;
}

async function scrapeFindTender() {
  const res = await fetch(FTN_URL);
  const html = await res.text();
  const $ = cheerio.load(html);
  const results: any[] = [];
  
  $('.search-result').each((_, el) => {
    const title = $(el).find('h2 a').text().trim();
    const link = $(el).find('h2 a').attr('href');
    results.push({
      source: 'FTN',
      title,
      url: link ? `https://www.find-tender.service.gov.uk${link}` : null,
      buyer: null,
      value_text: null,
      deadline: null,
      published: null,
      cpv_codes: [],
      tags: []
    });
  });
  
  return results;
}

async function main() {
  console.log('Starting scrape...');
  const cf = await scrapeContractsFinder();
  const ftn = await scrapeFindTender();
  const all = [...cf, ...ftn];
  
  console.log(`Total: ${all.length}. CF: ${cf.length}, FT: ${ftn.length}`);
  
  const { error } = await supabase.from('tenders').upsert(all, { onConflict: 'url' });
  if (error) console.error('Upsert error:', error);
  else console.log(`Upserted: ${all.length}`);
}

main();
