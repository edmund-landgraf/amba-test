"use strict";

const HANDLE_PART_WINDOW = 1000;
const POOL_MIN = HANDLE_PART_WINDOW + 48;

function titleCase(word) {
  const clean = String(word || "").replace(/[^a-z0-9]+/gi, "");
  if (!clean) return "";
  return clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();
}

function parseList(text) {
  const seen = new Set();
  const out = [];
  for (const raw of String(text).split(/[^A-Za-z]+/)) {
    const word = titleCase(raw);
    if (word.length < 4 || word.length > 14) continue;
    const key = word.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(word);
  }
  return out;
}

function expandTo(list, min) {
  const prefixes = parseList(`
    Aero Amber Ashen Azure Boreal Bright Cedar Cinder Cloud Copper Crystal Dawn Dusky
    Ember Fable Fern Frost Gilded Harbor Hidden Iron Ivory Jade Keen Lucky Maple Merry
    Misty Mossy Nimble North Ocean Olive Opal Pearl Pine Quiet Rapid River Rune Sage
    Silver Slippery Solar South Storm Sturdy Sunlit Swift Thorn Tide Umber Velvet Wild
    Windy Witty Zephyr Coral Dusk Emberglow Flint Honey Lunar Quartz Raven Rowan Terra
  `);
  const out = list.slice();
  const seen = new Set(out.map((word) => word.toLowerCase()));
  outer:
  for (const prefix of prefixes) {
    for (const word of list) {
      if (out.length >= min) break outer;
      const next = titleCase(`${prefix}${word}`);
      if (next.length > 16) continue;
      const key = next.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(next);
    }
  }
  if (out.length < min) {
    throw new Error(`Could not expand handle parts to ${min} (got ${out.length})`);
  }
  return out;
}

const adjectiveSeeds = parseList(`
  Brisk Copper Clever Dusky Gentle Hidden Lucky Merry Nimble Quiet Rapid Silver
  Slippery Sturdy Velvet Witty Agile Amber Ancient Azure Bold Brave Bright Calm
  Cinder Clear Cloud Coral Crisp Daring Dawn Eager Ember Fair Fable Fern Fierce
  Fine Fleet Flint Fresh Frost Gilded Golden Grand Humble Ivory Jade Keen Kind
  Lively Lunar Maple Misty Noble Ocean Olive Opal Pearl Pine Plucky Prime Proud
  Quick Radiant Ready River Rugged Rune Sage Sandy Sharp Sleek Solar Spry Steady
  Storm Sunlit Swift Terra Thorn Tide True Umber Vivid Warm Wild Windy Wise Zephyr
  Aerial Alpine Arctic Autumn Boreal Bronze Canyon Cedar Cosmic Crystal Dapper
  Delta Desert Distant Divine Earthy Echoing Elfin Fancy Floral Forest Gentle
  Harbor Harvest Hazel Hollow Honey Iron Jolly Luminous Meadow Midnight Mossy
  Mountain Mystic Naval Nightly Northern Ornate Peaceful Polar Prairie Quiet
  Restful Rowan Royal Rustic Shadow Silent Snowy Southern Stellar Summer Tideless
  Twilight Urban Valiant Verdant Western Winter Woodland Yellow
`);

const nounSeeds = parseList(`
  Anchor Banner Beacon Beetle Candle Comet Compass Ember Lantern Maple Orbit
  Pebble Quill Riddle Signal Thimble Acorn Anvil Arrow Aspen Badger Barrel Basin
  Birch Blossom Boulder Bridge Brook Candle Cedar Chalice Cinder Cloak Cloud
  Copper Creek Crystal Dagger Daisy Delta Dragon Drift Eagle Ember Falcon Fern
  Finch Flint Forest Forge Foxglove Garden Gate Glacier Griffin Grove Hammer
  Harbor Hawk Hazel Herald Heron Hollow Honey Iris Island Ivory Jasper Kestrel
  Knot Lantern Lark Laurel Ledger Lotus Lumen Magnet Maple Meadow Mirror Moss
  Moth Needle Nettle Oakwood Obelisk Ocean Olive Opal Orchid Osprey Otter Oxbow
  Paladin Pebble Phoenix Pine Pitcher Plover Poppy Portal Prairie Quail Quartz
  Quill Raven Ridge River Robin Rowan Sable Sailor Scarlet Scepter Shadow Shell
  Shield Shore Sparrow Spire Spruce Squire Stone Stream Summit Swan Sword Thistle
  Thorn Thunder Tide Tiger Timber Torch Trail Tulip Valley Velvet Violet Vista
  Walnut Willow Windmill Wisp Wolfwood Wreath Yacht Zephyr
`);

const adjectives = expandTo(adjectiveSeeds, POOL_MIN);
const nouns = expandTo(nounSeeds, POOL_MIN);

module.exports = {
  HANDLE_PART_WINDOW,
  adjectives,
  nouns
};
