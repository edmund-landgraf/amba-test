"use strict";

const HANDLE_PART_WINDOW = 500;

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

function requireCount(list, min) {
  if (list.length < min) {
    throw new Error(`local list is ${list.length}, need ${min}`);
  }
  return list;
}

const adjectives = requireCount(parseList(`
  Able Acid Acute Adept Agile Alert Alive Amber Ample Ancient Angry Antique Anxious
  Apt Arctic Ardent Artistic Ashen Astute Athletic Austere Autumn Azure Balmy Barren
  Bashful Basic Beaming Better Bitter Blazing Bleak Blessed Blind Blond Blunt Bold
  Bossy Bouncy Brash Brave Breezy Brief Bright Brisk Brittle Broad Bronze Bubbly
  Bulky Bumpy Busy Calm Candid Canny Capable Capital Careful Casual Catchy Cedar
  Cerulean Chaotic Charming Cheerful Cheery Chilly Chipper Civic Civil Classic Clean
  Clear Clever Cloudy Clumsy Coarse Coastal Cocky Cold Colorful Colossal Comic Common
  Compact Complex Concrete Confident Cool Copper Coral Cosmic Costly Cozy Crafty
  Cranky Creamy Crisp Crooked Crowded Crucial Crumbly Crunchy Cryptic Crystal Cuddly
  Cultured Curious Curly Curved Cute Damp Dapper Daring Dark Dashing Dauntless
  Dazzling Decent Deep Defiant Delicate Delicious Dense Distant Divine Dizzy Docile
  Dotted Double Drab Drafty Dramatic Dreary Dusky Dusty Eager Early Earthy Easy
  Eccentric Edgy Eerie Elastic Elated Elderly Electric Elegant Elfin Elite Eloquent
  Elusive Empty Endless Energetic Enigmatic Equal Ethereal Even Exotic Expert Fabled
  Faint Fair Faithful Famous Fancy Fantastic Fast Fearless Feisty Feline Fertile
  Fervent Festive Fickle Fierce Fine Firm First Fishy Fit Fixed Flaky Flashy Flat
  Flawless Fleet Flexible Floral Flowery Fluffy Fluid Foamy Fond Formal Fortunate
  Fragile Fragrant Frail Frank Frayed Free Fresh Friendly Frigid Frilly Frisky Frosty
  Frozen Frugal Fruitful Funky Funny Furry Fussy Fuzzy Galactic Gallant Generous
  Gentle Giant Giddy Gifted Giggly Glad Glassy Gleaming Gleeful Glittery Global
  Gloomy Glossy Glowing Golden Goofy Gorgeous Graceful Gradual Grand Graphic Grateful
  Grave Greasy Great Greedy Green Gregarious Grim Grimy Grizzled Groovy Grouchy
  Growly Grubby Gruff Grumpy Guarded Gummy Gusty Hairy Handy Happy Hardy Harsh Hasty
  Hazy Healthy Hearty Heavenly Heavy Hefty Helpful Heroic Hidden Hoarse Hollow Honest
  Honey Hopeful Horned Humble Humid Hungry Hushed Husky Icy Ideal Idle Immense
  Immortal Impish Important Imposing Impressive Indirect Indoor Inky Inner Innocent
  Intense Intent Iron Ironic Itchy Ivory Jade Jagged Jaunty Jazzy Jolly Jovial Joyful
  Joyous Juicy Jumbo Jumpy Junior Just Keen Kind Kindly Kooky Lacy Large Last Late
  Lavender Lavish Lazy Leafy Lean Legal Level Light Likely Linear Liquid Little Live
  Lively Lofty Lone Lonely Long Loose Lost Loud Lovely Loving Loyal Lucid Lucky
  Luminous Lunar Lush Lyric Magic Magical Magnetic Majestic Major Maple Marble Marine
  Maroon Massive Mature Meager Meek Mellow Melodic Merry Metallic Mild Milky Mini
  Minor Minty Misty Mixed Modern Modest Moist Molten Monthly Moral Mossy Muddy Murky
  Mushy Musty Mute Mysterious Mystic Naive Narrow Natural Naughty Naval Near Neat
  Needy Nervous Nice Nimble Noisy Normal North Notable Novel Numb Nutty Oaken Oblong
  Obvious Ocean Olive Ominous Open Orange Ornate Outer Oval Overdue Pale Parallel
  Peaceful Peach Pearly Peppy Perfect Perky Pesky Petite Pink Plain Placid Playful
  Pleasant Plucky Plum Plump Poetic Pointed Polar Polished Polite Popular Portly Posh
  Positive Powerful Precious Precise Pretty Prickly Prime Pristine Private Prize
  Prompt Proper Proud Prudent Puffy Pungent Pure Purple Pushy Quaint Queasy Quick
  Quiet Quirky Radiant Rapid Rare Rash Ready Real Recent Reckless Regal Regular
  Relaxed Reliable Remote Restless Rich Rigid Ripe Ritual River Robust Rocky Romantic
  Roomy Rosy Rough Round Rowdy Royal Rubbery Ruddy Rugged Rumpled Rural Rustic Rusty
  Sacred Safe Sage Salty Sandy Sane Sassy Savory Scaly Scarce Scarlet Scary Scenic
  Scholarly Scrappy Scratchy Scrawny Secret Serene Serious Shady Shaky Shallow Sharp
  Sheer Shiny Short Shy Silent Silky Silly Silver Simple Sincere Single Skinny Sleek
  Sleepy Slick Slight Slim Slimy Slow Sly Small Smart Smiling Smoky Smooth Smug
  Snappy Sneaky Snowy Snug Soapy Soft Solar Solid Solo Soggy Solemn Somber Sooty Sour
  South Spare Sparkly Sparse Spicy Spiky Splendid Spooky Spotless Spotted Spry Square
  Stable Stale Stark Steady Steep Sticky Stiff Still Stormy Stout Straight Strange
  Strict Strong Stubborn Stunning Sturdy Stylish Subtle Sudden Sugary Sulky Sunny
  Super Superb Sure Swanky Sweet Swift Sylvan Tame Tangy Tart Tasty Teal Tender Tense
  Thankful Thick Thin Thirsty Thorny Thoughtful Tidy Tight Timid Tiny Tired Toasty
  Tough Towering Tranquil Tricky True Trusty Turbulent Twin Twisted Ultimate Ultra
  Umber Uncommon Uneven Unique Unlucky Untidy Unusual Upbeat Urban Useful Vacant Vague
  Valiant Valid Vast Velvet Verdant Versed Vibrant Vivid Vocal Warm Wary Wavy Weak
  Weary Weekly Weird Welcome Western Wet Whimsical White Whole Wicked Wide Wild
  Willing Windy Winged Winning Winsome Winter Wise Witty Wonderful Wooden Woolly
  Worthy Wry Yearly Yellow Young Yummy Zany Zealous Zesty Zippy Ambiguous Ambitious
  Amusing Animated Annual Aquatic Arid Aromatic Assertive Assorted Atomic Attentive
  Attractive Authentic Awesome Awkward Barbed Beloved Beneficial Bizarre Blank
  Blissful Blushing Bookish Botanical Boundless Bountiful Briny Buoyant Carefree
  Celestial Cerebral Ceremonial Charismatic Cheeky Cherished Cinnamon Circular
  Climatic Clinical Cloudless Coastal Comical Composed Concise Courteous Creative
  Critical Dainty Decisive Decorative Delightful Dependable Detailed Determined
  Devoted Diligent Distinct Dreamy Durable Dynamic Earnest Easygoing Eclectic
  Efficient Elemental Emerald Emotional Enchanted Engaging Enormous Enthusiastic
  Eternal Everyday Evident Excellent Excited Exclusive Expected Explicit Expressive
  Exquisite Fairytale Familiar Flavorful Fluent Focused Frequent Frosted Genuine
  Glittering Glorious Gutsy Harmless Harmonious Heartfelt Humorous Imaginative
  Immediate Independent Infinite Informal Ingenious Inspired Intimate Inventive
  Jubilant Logical Marvelous Meaningful Measured Memorable Mighty Mindful Miniature
  Mirthful Modular Moonlit Motionless Mountainous Musical Mythic Nearby Necessary
  Neutral Noble Nocturnal Nurturing Objective Occasional Official Optimistic Orderly
  Organic Original Outgoing Outlandish Outspoken Persistent Personal Plentiful
  Possible Practical Productive Professional Profound Public Punctual Qualified
  Rational Realistic Reasonable Refined Reflective Remarkable Resourceful Respectful
  Responsible Restful Satisfied Seasonal Selective Sensible Sensitive Similar
  Skillful Southern Special Specific Sparkling Stately Stern Sufficient Symbolic
  Tactful Talented Tangible Theoretical Thrifty Timeless Traditional Triumphant
  Typical Universal Unlikely Valuable Versatile Watchful Workable Worldly Youthful
  Zestful Academic Accurate Actual Adaptive Admirable Adorable Adventurous Aerial
  Aesthetic Affable Affectionate Affordable Agreeable Airy Alpine Alternate Amazing
  Analog Angular Apparent Approachable Argent Ascending Aspiring Astral Atmospheric
  Atypical Audible August Auspicious Autumnal Available Average Awake Aware Baroque
  Bearded Beastly Beautiful Beige Bilingual Binary Biting Black Blended Blooming
  Boisterous Booming Bottomless Brilliant Brown Bubbling Built Buried Burning
  Bustling Buttoned Calico Camouflage Canvas Captivating Cardinal Charged Charted
  Chestnut Chiming Chocolate Choice Chronic Clockwork Cobalt Comfortable
  Compassionate Competitive Complete Confused Connected Conscious Considerate
  Consistent Constant Contented Correct Cotton Craggy Current Custom Descriptive
  Deserted Discrete Diverse Domestic Downstream Downtown Dual Effective Elevated
  Enough Essential Established Everyday Expected Familiar Flavorful Fluent Focused
`), 500);

const nouns = requireCount(parseList(`
  Acorn Albatross Almond Alpaca Amber Anchor Angelfish Antelope Anvil Apple Apricot
  Arcade Archer Archive Argyle Armadillo Armor Arrow Asparagus Aspen Asteroid Atlas
  Attic Avalanche Avocado Badger Bagel Bakery Balloon Bamboo Banana Bandit Bangle
  Banner Banjo Banyan Barnacle Barrel Basil Basket Bassoon Beacon Beagle Beaker
  Beaver Bedroom Beetle Belfry Berry Bicycle Birch Biscuit Bison Blackbird Blanket
  Blizzard Blossom Bluebell Bluebird Bobcat Bonfire Bonnet Bookcase Bookstore Boulder
  Bouquet Bramble Branch Brazil Breeze Brick Bridge Bridle Broccoli Bronco Brook
  Broom Bubble Bucket Buffalo Bugle Building Bulldog Bulletin Bungalow Bunker Buoy
  Bureau Butter Butterfly Button Cabbage Cabin Cabinet Cactus Cadet Cafe Cake
  Calendar Camel Campfire Canal Candle Candy Canoe Canyon Captain Caravan Cardinal
  Cargo Carnival Carpet Carriage Carrot Carton Castle Caterpillar Cathedral Cauldron
  Cave Cedar Ceiling Cellar Cello Century Chain Chair Chalice Chamber Champion
  Channel Chapel Chariot Cheetah Cherry Chest Chestnut Chickadee Chicken Chimney
  Chipmunk Chocolate Cider Cinnamon Circle Citadel Citrus Clam Clarinet Cliff Cloak
  Clock Cloud Clover Club Coach Cobalt Cobra Coconut Coffee Coin Collar Comet Compass
  Condor Cone Constellation Cookie Copper Coral Cork Cornflower Cottage Cotton Cougar
  Country Court Coyote Cradle Crane Crater Creek Crescent Cricket Crimson Crocodile
  Crown Crystal Cuckoo Cupboard Cupcake Current Curtain Cushion Cypress Daffodil
  Dagger Daisy Damson Dandelion Dancer Dormouse Dove Dragon Dragonfly Drake Drawer
  Driftwood Drum Dryad Duckling Dugong Dune Eagle Earthworm Egret Elephant Falcon
  Ferret Finch Firefly Flamingo Flounder Forest Forge Foxglove Fountain Garden Gate
  Gazelle Gecko Gerbil Giraffe Glacier Goat Goldfish Goose Gopher Gorilla Griffin
  Grove Hammer Hamster Harbor Hawk Hazel Hedgehog Herald Heron Hollow Honey Hummingbird
  Hyena Ibex Iguana Impala Iris Island Ivory Jackal Jaguar Jasper Jellyfish Jungle
  Kangaroo Kestrel Kettle Kingfisher Kitten Koala Kraken Ladybug Lantern Lark Laurel
  Ledger Lemon Leopard Lettuce Lilac Lily Lizard Llama Lobster Lotus Lynx Macaw
  Magpie Mallard Mammoth Manatee Mandrill Mantis Maple Marmot Meadow Meerkat Minnow
  Mirror Monkey Moose Mosquito Moth Mouse Muffin Mushroom Mussel Narwhal Nettle
  Nightingale Oakwood Obelisk Ocean Octopus Olive Opal Orangutan Orchid Osprey Ostrich
  Otter Oyster Panda Panther Parakeet Parrot Partridge Peacock Pebble Pelican Penguin
  Peony Pepper Phoenix Pigeon Pineapple Platypus Plover Poppy Porcupine Porpoise
  Portal Prairie Puffin Pumpkin Python Quail Quartz Quill Rabbit Raccoon Raven
  Reindeer Riddle River Robin Rowan Sable Sailor Salamander Salmon Sandpiper Scepter
  Scorpion Seahorse Shadow Shark Shell Shield Shore Shrimp Signal Skunk Sloth Snail
  Sparrow Spider Spire Sponge Spruce Squirrel Starfish Stingray Stork Swallow Swan
  Swordfish Tapir Tarantula Terrier Thimble Thistle Thorn Thunder Tiger Timber Toad
  Tortoise Toucan Trail Trout Tulip Turkey Turtle Unicorn Valley Velvet Violet Vista
  Vulture Walnut Walrus Warbler Weasel Whale Willow Windmill Wisp Wolverine Wombat
  Woodpecker Wreath Wren Yacht Zebra Zephyr Aardvark Alligator Anemone Baboon Barracuda
  Basilisk Buzzard Caribou Catfish Chimpanzee Cicada Cockatoo Cuttlefish Dachshund
  Dolphin Donkey Earthstar Firethorn Foxhound Gazebo Goldfinch Greyhound Grouse
  Harrier Herring Hippo Hornet Horse Hyacinth Jackrabbit Juniper Kelpie Kookaburra
  Lemming Lemur Locust Magenta Mandolin Marigold Narwhal Newt Nightjar Ocelot Oriole
  Paddle Paladin Papaya Parsley Peanut Pecan Persimmon Petunia Pheasant Pistachio
  Pitcher Plover Primrose Quince Radish Raspberry Redwood Rhubarb Roadrunner Rooster
  Saffron Sequoia Sesame Shallot Snapdragon Sorghum Soybean Spinach Starling Sturgeon
  Sunflower Sycamore Tamarind Tangerine Termite Thrush Thyme Tomato Turnip Vanilla
  Viper Walnut Warthog Waterfall Wolverine Woodlark Wombat Yak Yucca Zinnia
  Aster Badger Barn Owl wait
  Aster Badger Barnacle Barrow Basin Beehive Belltower Bobolink Brambleberry
  Buttercup Campanile Capybara Cardinalfish Cattail Cedarwax Chickweed Chicory
  Clifftop Cloister Cobblestone Corncrake Cottonwood Crayfish Crickethouse
  Crossbill Crowsnest Cubicle Cypressknot Damselfly Deerhound Dewdrop Dockside
  Dogwood Dovekie Drumlin Earthstar Eiderdown Elderberry Elkhorn Emberglow
  Fiddlehead Firethorn Flamefish Flatiron Foghorn Foolsgold Frostbite Gannet
  Gardenia Gatehouse Glasswort Glowworm Goldcrest Goshawk Grackle Greenfinch
  Groundhog Guillemot Hairgrass Halibut Hawthorn Hazelwood Heathland Hedgehog
`), 500);

const adverbs = requireCount(parseList(`
  Abruptly Absently Accurately Actively Actually Acutely Adorably Adversely
  Affectionately Quickly Quietly Boldly Bravely Brightly Briskly Calmly Carefully
  Casually Cautiously Cheerfully Clearly Closely Clumsily Coldly Commonly Completely
  Constantly Coolly Correctly Cowardly Coyly Crossly Crudely Cruelly Cunningly
  Curiously Currently Daily Daintily Daringly Darkly Deadly Dear Dear Dear
  Decidedly Deeply Defiantly Deliberately Delicately Densely Differently Dimly
  Directly Discreetly Distantly Distinctly Doggedly Doubly Downward Dramatically
  Dreamily Drowsily Eagerly Early Easily Eerily Elegantly Eloquently Endlessly
  Energetically Equally Especially Evenly Eventually Exactly Excitedly Expertly
  Explicitly Extremely Fairly Faithfully Famously Fast Fiercely Finally Firmly
  Fitfully Flatly Fondly Foolishly Forever Formally Formerly Forthrightly Frankly
  Freely Frequently Freshly Frightfully Fully Furiously Generally Gently Genuinely
  Gladly Gleefully Gracefully Gradually Gratefully Greatly Greedily Grimly Happily
  Hard Hardly Harshly Hastily Heartily Heavily Helpfully Highly Honestly Hopelessly
  Hourly Hungrily Hurriedly Immediately Inwardly Innocently Instantly Intensely
  Intentionally Inwardly Inward
  Inwardly Ironically Irregularly Jealously Jovially Joyfully Joyously Justly Keenly
  Kindly Knowingly Largely Lately Lazily Lightly Likely Lively Loftily Loosely Loudly
  Lovingly Lowly Loyally Luckily Madly Mainly Manually Markedly Meaningfully
  Meanwhile Meekly Merrily Mightily Mildly Minute Minutely Monthly Mostly Mysteriously
  Narrowly Naturally Nearly Neatly Nervously Never Newly Nicely Nightly Noisily
  Normally Notably Numbly Obviously Occasionally Oddly Officially Often Only Openly
  Orderly Outwardly Overly Painfully Partially Patiently Perfectly Permanently
  Persistently Personally Physically Plainly Playfully Politely Poorly Positively
  Possibly Potentially Powerfully Precisely Presently Pretty Previously Primarily
  Privately Probably Promptly Properly Proudly Publicly Purely Quickly Quietly
  Rapidly Rarely Readily Really Recently Recklessly Regularly Reluctantly Repeatedly
  Rightfully Rigidly Roughly Roundly Rudely Sadly Safely Scarcely Secretly Securely
  Seemingly Seldom Selfishly Sensibly Seriously Severely Shakily Sharply Sheepishly
  Shortly Shyly Silently Simply Sincerely Sleepily Slightly Slowly Slyly Smoothly
  Softly Solemnly Solidly Soon Sorely Sparingly Specially Speedily Steadily Stealthily
  Sternly Stiffly Still Strangely Strictly Strongly Stubbornly Stylishly Subsequently
  Successfully Suddenly Sufficiently Superbly Surely Surprisingly Swiftly Silently
  Tactfully Temporarily Tenderly Tense Terribly Thankfully Then Thickly Thinly
  Thoroughly Thoughtfully Tightly Timidly Today Together Tomorrow Tonight Totally
  Tremendously Truly Typically Ultimately Unusually Upward Usually Utterly Vaguely
  Vainly Valiantly Vastly Verbally Very Viciously Victoriously Vigorously Violently
  Visibly Warmly Weakly Wearily Weekly Well Widely Wildly Willingly Wisely Wistfully
  Woefully Wonderfully Wrongly Yearly Yieldingly Zealously Zestfully
  Abundantly Accidentally Accordingly Additionally Adequately Admirably Admittedly
  Aggressively Agreeably Alarmingly Amazingly Angrily Anxiously Apparently
  Appropriately Arrogantly Awkwardly Badly Barely Beautifully Bitterly Blindly
  Blissfully Boastfully Brashly Breathlessly Briefly Brilliantly Broadly Busily
  Capably Carelessly Certainly Cheaply Cleanly Cleverly Closely Collectively
  Comfortably Comparatively Competently Confidently Consciously Consequently
  Considerably Consistently Continually Conveniently Conversely Convincingly
  Cordially Courageously Creatively Critically Currently Dearly Decisively Deeply
  Definitely Deliberately Delightfully Densely Desperately Determinedly Differently
  Diligently Distinctly Doubtfully Dramatically Drastically Dreadfully Dutifully
  Effectively Efficiently Effortlessly Emotionally Endlessly Entirely Equally
  Essentially Eternally Evenly Eventually Evidently Exactly Exceedingly Exceptionally
  Excessively Exclusively Explicitly Expressly Extensively Extraordinarily Extremely
  Faintly Faithfully Fantastically Fearfully Fearlessly Ferociously Fervently
  Fiercely Finally Firmly Forcefully Forever Formally Formerly Frankly Freely
  Frequently Frightfully Fully Fundamentally Generally Generously Gently Genuinely
  Glaringly Globally Gloriously Gradually Graciously Gratefully Greatly Grimly
  Happily Hardly Harshly Hastily Heartily Heavily Helpfully Helplessly Highly
  Honestly Hopelessly Horribly Hugely Humbly Hungrily Immediately Immensely
  Impatiently Implicitly Importantly Inadvertently Increasingly Incredibly Indeed
  Independently Indirectly Individually Inevitably Initially Inner Inner Inner
  Innocently Instantly Instead Intensely Intentionally Internally Intimately
  Inwardly Ironically Irregularly Irrevocably Joyfully Justly Keenly Kindly Largely
  Lately Later Lazily Legally Lightly Literally Locally Logically Loosely Loudly
  Lovingly Luckily Mainly Manually Markedly Meanwhile Mentally Merely Merrily Mildly
  Minute Minutely Monthly Moreover Mostly Mutually Namely Naturally Nearly Neatly
  Necessarily Needlessly Negatively Nervously Never Newly Nicely Nightly Noisily
  Normally Notably Noticeably Obviously Occasionally Officially Often Only Openly
  Opposite Originally Outwardly Overly Painfully Partially Particularly Partly
  Passionately Patiently Perfectly Permanently Persistently Personally Physically
  Plainly Playfully Politely Poorly Popularly Positively Possibly Potentially
  Powerfully Practically Precisely Preferably Presently Previously Primarily
  Principally Privately Probably Profoundly Progressively Promptly Properly Proudly
  Publicly Purely Purposely Quickly Quietly Rapidly Rarely Readily Realistically
  Really Recently Recklessly Regularly Relatively Reluctantly Remarkably Repeatedly
  Reportedly Respectively Rightfully Rigidly Roughly Sadly Safely Scarcely Secondly
  Secretly Securely Seemingly Seldom Selfishly Sensibly Seriously Severely Sharply
  Shortly Shyly Significantly Silently Similarly Simply Sincerely Slightly Slowly
  Smoothly Socially Softly Solemnly Solidly Somehow Sometimes Somewhere Soon
  Specially Specifically Speedily Steadily Stealthily Sternly Still Strangely
  Strictly Strongly Subsequently Successfully Suddenly Sufficiently Superbly Surely
  Surprisingly Swiftly Tactfully Temporarily Tenderly Thankfully Then Thereafter
  Therefore Thoroughly Thoughtfully Tightly Today Together Tomorrow Tonight Totally
  Tremendously Truly Typically Ultimately Unusually Upward Usually Utterly Vaguely
  Valiantly Vastly Verbally Vigorously Visibly Warmly Weakly Wearily Weekly Widely
  Wildly Willingly Wisely Wonderfully Wrongly Yearly Zealously
  Outright Overboard Overhead Overnight Overseas Sideways Skyward Southward Straightway
  Thereafter Thereupon Underfoot Underneath Upstairs Downstairs Homeward Eastward
  Westward Northward Inland Onboard Onshore Offshore Outdoors Indoors Overland
`), 500);

const verbs = requireCount(parseList(`
  Accept Accuse Achieve Acquire Adapt Add Address Adjust Admire Admit Adopt Advise
  Afford Agree Aim Allow Alter Amaze Amend Amount Announce Annoy Answer Apologize
  Appear Applaud Apply Appreciate Approach Approve Argue Arise Arrange Arrive Ask
  Assemble Assist Assume Attach Attack Attempt Attend Attract Avoid Awake Bake
  Balance Ban Bang Bargain Bathe Battle Beam Beg Begin Behave Belong Bend Bet Bind
  Bite Blame Bless Blink Bloom Blow Blush Boast Boil Bolt Book Bore Borrow Bounce
  Bow Box Brag Brake Branch Break Breathe Breed Bring Broadcast Brush Build Bump
  Burn Burst Bury Buy Buzz Calculate Call Camp Care Carry Carve Catch Cause Cease
  Celebrate Challenge Change Charge Chase Chat Check Cheer Chew Choose Chop Claim
  Clap Clean Clear Climb Cling Clip Close Coach Coil Collect Color Comb Combine
  Come Comfort Command Communicate Compare Compete Complain Complete Compose
  Concern Conclude Conduct Confess Confirm Confuse Connect Consider Consist Consult
  Contain Continue Contribute Control Convert Convince Cook Cool Copy Correct Cost
  Cough Count Cover Crack Crash Crawl Create Creep Criticize Cross Crush Cry Cure
  Curl Curve Cycle Dam Damage Dance Dare Deal Decide Decorate Define Delay Delete
  Delight Deliver Demand Deny Depend Describe Deserve Design Desire Destroy Detect
  Develop Differ Dig Direct Disagree Disappear Discover Discuss Dislike Divide Do
  Double Doubt Drag Drain Draw Dream Dress Drink Drive Drop Drown Drum Dry Dump
  Dust Earn Eat Educate Employ Empty Encourage End Endure Engage Enhance Enjoy
  Enter Entertain Escape Examine Excite Excuse Execute Exercise Exist Expand Expect
  Explain Explode Explore Express Extend Face Fade Fail Fall Fancy Farm Fasten Fear
  Feed Feel Fetch Fight Fill Film Find Finish Fire Fit Fix Flash Float Flood Flow
  Flower Fly Fold Follow Fool Force Forgive Form Found Frame Freeze Frighten Fry
  Gather Gaze Glow Glue Grab Grade Greet Grind Grip Groan Guarantee Guard Guess
  Guide Hammer Hand Handle Hang Happen Harm Hate Haunt Head Heal Heap Hear Heat
  Help Hide Hint Hit Hold Hook Hop Hope Hover Hug Hum Hunt Hurry Hurt Identify
  Ignore Imagine Impress Improve Include Increase Influence Inform Inject Injure
  Instruct Intend Interest Interfere Interrupt Introduce Invent Invite Involve Iron
  Irritate Itch Jail Jam Jog Join Joke Judge Jump Justify Keep Kick Kill Kiss Kneel
  Knit Knock Knot Know Label Land Last Laugh Launch Lead Leak Lean Learn Leave Lend
  Let Level License Lick Lie Lift Light Like List Listen Live Load Lock Long Look
  Love Lower Mail Maintain Make Manage March Mark Marry Match Matter Mean Measure
  Meet Melt Memorize Mend Mention Prefer Prefer
  Mention Merge Milk Mine Miss Mix Moan Modify Monitor Moose
  Motivate Mourn Move Mow Mug Multiply Murder Nail Name Need Nest Nod Note Notice
  Number Obey Object Observe Obtain Occur Offend Offer Open Operate Order Organize
  Originate Overflow Owe Own Pack Paddle Paint Park Part Pass Paste Pat Pause Pay
  Peck Pedal Peel Peep Perform Permit Phone Pick Pinch Pine Place Plan Plant Play
  Please Pledge Plug Point Poke Polish Pop Possess Post Pour Practise Pray Preach
  Precede Prefer Prepare Present Preserve Press Pretend Prevent Prick Print Produce
  Program Promise Protect Provide Pull Pump Punch Puncture Punish Push Question
  Queue Quit Race Rain Raise Reach Read Realize Receive Recognize Record Reduce
  Reflect Refuse Regard Regret Reign Reject Rejoice Relax Release Rely Remain
  Remember Remind Remove Repair Repeat Replace Reply Report Reproduce Request Rescue
  Retire Return Rhyme Ride Ring Rise Risk Roast Rob Rock Roll Rot Rub Ruin Rule
  Rush Sack Sail Satisfy Save Saw Scare Scatter Scold Scorch Scrape Scratch Scream
  Seal Search Separate Serve Settle Shade Share Shave Shelter Shift Shine Shiver
  Shock Shoot Shop Shorten Shout Show Shrug Shut Sigh Sign Signal Sin Sing Sip Sit
  Skate Ski Skip Slap Slip Slow Smash Smell Smile Smoke Snatch Sneeze Sniff Snore
  Snow Soak Soar Solve Sort Sound Spare Spark Spell Spill Spoil Spot Spray Spread
  Spring Sprout Squash Squeak Squeal Squeeze Stain Stamp Stand Stare Start Stay
  Steer Step Stick Stir Stitch Stop Store Strap Strengthen Stretch Strip Stroke
  Stuff Subtract Succeed Suck Suffer Suggest Suit Supply Support Suppose Surprise
  Surround Suspect Suspend Swallow Swear Sweep Swell Swim Swing Switch Talk Tame
  Tap Taste Teach Tear Tease Telephone Tell Tempt Terrify Test Thank Thaw Tickle
  Tie Time Tip Tire Touch Tour Tow Trace Trade Train Transport Travel Treat Tremble
  Trick Trip Trot Trouble Trust Try Tug Tumble Turn Twist Type Undress Unfasten
  Unite Unlock Unpack Untidy Use Vanish Visit Wail Wait Walk Wander Want Warm Warn
  Wash Waste Watch Water Wave Weigh Welcome Whine Whip Whirl Whisper Whistle Wink
  Wipe Wish Wobble Wonder Work Worry Wrap Wreck Wrestle Wriggle Write Xray Yawn
  Yell Zip Zoom Abandon Absorb Accelerate Accomplish Accustom Accrue Activate
  Advance Advertise Advocate Align Allocate Analyze Anchor Anticipate Applaud Apply
  Archive Argue Arrange Ascend Assemble Assert Assign Assist Assume Attain Attend
  Attract Audit Authorize Award Balance Bargain Battle Beckon Befriend Begin Behave
  Believe Belong Benefit Betray Beware Bind Blame Blend Bless Block Bloom Blossom
  Bluff Boast Bolster Boost Borrow Bother Bounce Brace Breathe Brighten Broadcast
  Broaden Browse Brush Buckle Budget Build Bundle Bury Calculate Capture Careen
  Caress Catalog Celebrate Challenge Champion Change Charge Charm Chase Cheer Cherish
  Choose Chuckle Circle Claim Clarify Classify Cleanse Climb Clutch Coach Collaborate
  Collapse Collect Color Combat Combine Comfort Command Commence Comment Commit
  Communicate Compare Compel Compete Compile Complete Compose Compute Conceal
  Conceive Concentrate Conclude Condense Conduct Confer Confess Confine Confirm
  Conform Confront Confuse Congratulate Connect Conquer Conserve Consider Consist
  Console Construct Consult Consume Contact Contain Contemplate Continue Contract
  Contrast Contribute Control Convene Convert Convey Convince Cooperate Coordinate
  Correct Correlate Correspond Counsel Count Cover Craft Crawl Create Credit Cross
  Crowd Crush Cultivate Cure Curl Cycle Damage Dance Dare Dazzle Debate Decide
  Declare Decline Decorate Dedicate Deduce Defeat Defend Define Delay Delegate
  Delete Delight Deliver Demand Demonstrate Denote Deny Depend Depict Deploy Derive
  Describe Desert Deserve Design Desire Destroy Detect Determine Develop Devise
  Devote Diagnose Differ Digest Diminish Direct Disagree Disappear Disarm Discover
  Discuss Disguise Dismiss Display Dispute Dissolve Distinguish Distribute Disturb
  Dive Divide Document Dodge Donate Double Doubt Draft Drag Drain Draw Dream Dress
  Drift Drink Drive Drop Drown Drum Dry Dunk Dust Dwell Earn Ease Echo Edit Educate
  Elect Elevate Elicit Eliminate Embark Embrace Emerge Emphasize Employ Empower
  Empty Enable Enact Encounter Encourage End Endure Enforce Engage Enhance Enjoy
  Enlarge Enlighten Enlist Enrich Enroll Ensure Enter Entertain Escape Establish
  Estimate Evaluate Examine Exceed Exchange Excite Excuse Execute Exercise Exert
  Exhaust Exhibit Exist Expand Expect Expedite Expel Experience Experiment Explain
  Explode Explore Export Expose Express Extend Extract Face Fade Fail Fall Fancy
  Fascinate Fashion Fasten Fear Feature Feed Feel Fetch Fight Figure File Fill Film
  Filter Find Finish Fire Fit Fix Flag Flash Flatten Flee Flick Flip Float Flood
  Flourish Flow Flower Fly Focus Fold Follow Fool Force Forecast Forge Forget Forgive
  Form Formulate Found Frame Free Freeze Frighten Frown Fry Fulfill Function Furnish
  Gain Gather Gaze Generate Gesture Gift Glide Glimpse Glow Glue Grab Grade Grant
  Grasp Greet Grind Grip Groan Grow Guarantee Guard Guess Guide Handle Hang Happen
  Harm Harvest Hasten Haunt Head Heal Hear Heat Help Hesitate Hide Highlight Hint
  Hire Hold Honor Hook Hope Hover Hug Hunt Hurry Hurt Identify Ignite Ignore
  Illuminate Illustrate Imagine Imitate Immerse Impact Impart Implant Implement
  Implicate Imply Import Impose Impress Improve Include Incorporate Increase Indicate
  Induce Indulge Infect Infer Influence Inform Infuse Inhabit Inherit Inhibit
  Initiate Inject Injure Innovate Inquire Insert Inspect Inspire Install Instruct
  Insure Integrate Intend Interact Interest Interfere Interpet Interpret Interrupt
  Interview Introduce Invent Inventory Invest Investigate Invite Involve Isolate
  Issue Itch Join Joke Judge Jump Justify Keep Kick Kiss Kneel Knit Knock Know
  Label Land Last Laugh Launch Lead Lean Learn Leave Lend Level License Lift Light
  Like Limit Link List Listen Live Load Locate Lock Long Look Love Lower Maintain
  Make Manage Manufacture Map March Mark Market Marry Match Matter Mean Measure
  Meditate Meet Melt Memorize Mend Mention Merge Migrate Mind Mine Mirror Miss Mix
  Mobilize Model Modify Monitor Motivate Move Multiply Name Navigate Need Negotiate
  Nest Nod Nominate Note Notice Nourish Number Nurture Obey Object Observe Obtain
  Occupy Occur Offer Open Operate Oppose Opt Order Organize Originate Outline Overcome
  Overlook Oversee Owe Own Pack Paint Park Participate Pass Pause Pay Perform Permit
  Persuade Phone Pick Pilot Place Plan Plant Play Please Pledge Plot Plug Point
  Polish Ponder Pop Portray Possess Post Pour Practice Pray Predict Prefer Prepare
  Present Preserve Press Pretend Prevent Print Process Proclaim Produce Program
  Progress Project Promise Promote Propose Protect Protest Provide Publish Pull
  Pump Punch Purchase Pursue Push Qualify Question Quit Race Raise Reach Read Realize
  Reason Reassure Recall Receive Recite Recognize Recommend Record Recruit Reduce
  Refer Refine Reflect Reform Refuse Regain Regard Register Regret Regulate Reign
  Reinforce Reject Rejoice Relate Relax Release Rely Remain Remember Remind Remove
  Render Renew Repair Repeat Replace Reply Report Represent Request Require Rescue
  Research Resemble Reserve Reside Resign Resist Resolve Respect Respond Rest
  Restore Restrict Result Resume Retain Retire Retract Return Reveal Reverse Review
  Revise Revive Reward Rhyme Rid Ride Ring Rise Risk Roam Roar Roast Rock Roll
  Rotate Rub Ruin Rule Run Rush Sail Sample Satisfy Save Scale Scan Scare Scatter
  Schedule Score Scout Scrape Scratch Scream Screen Seal Search Secure See Seek
  Select Sell Send Sense Separate Serve Set Settle Shade Share Sharpen Shatter
  Shelter Shift Shine Ship Shock Shoot Shop Shout Show Shrink Shrug Shut Sigh Sign
  Signal Sing Sit Sketch Skip Sleep Slide Slip Slow Smash Smell Smile Smoke Snap
  Snatch Sneak Soar Solve Sort Sound Spare Spark Speak Specify Speed Spell Spend
  Spill Spin Split Spoil Sponsor Spot Spray Spread Spring Sprout Square Squeeze
  Stabilize Stage Stamp Stand Stare Start State Stay Steer Step Stick Stimulate
  Stir Stop Store Strengthen Stretch Strike Strive Stroke Structure Struggle Study
  Submit Succeed Suffer Suggest Suit Summarize Supervise Supply Support Suppose
  Suppress Surprise Surround Survey Survive Suspect Sustain Swallow Swear Sweep
  Swim Swing Switch Tackle Talk Tame Tap Target Taste Teach Tear Tease Tell Tempt
  Tend Terminate Test Thank Think Thrive Throw Tickle Tie Tighten Time Tip Tire
  Tolerate Toss Touch Tour Trace Track Trade Train Transfer Transform Translate
  Transmit Transport Travel Treat Tremble Trick Trigger Trim Trip Trot Trouble Trust
  Try Tug Tune Turn Twist Type Uncover Undergo Underline Understand Undertake Undo
  Unfold Unite Unlock Unpack Update Upgrade Uphold Upset Urge Use Utilize Validate
  Value Vanish Vary Venture Verify View Visit Voice Volunteer Vote Wait Walk Wander
  Want Warm Warn Wash Waste Watch Wave Weaken Wear Weave Weigh Welcome Whip Whisper
  Whistle Win Wind Wipe Wish Withdraw Withstand Witness Wonder Work Worry Wrap Wreck
  Wrestle Write Yawn Yield Zoom
`), 500);

module.exports = {
  HANDLE_PART_WINDOW,
  adjectives,
  nouns,
  adverbs,
  verbs
};
