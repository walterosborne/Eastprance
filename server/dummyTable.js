export const DUMMY_TABLE_NAME = 'dummy_table_name';

const PAYMENT_BASIS_SEQUENCE = ['per Month', 'per Annual', 'per Quarter'];

const beatlesPaymentTypes = [
  'Fab Four Fancies',
  'Yellow Submarine Snacks',
  'Octopus Garden Odds',
  'Sgt Pepper Sundries',
  'Abbey Road Trinkets'
];

const beatlesPaymentSummaries = [
  'Penny Lane Puddle Mirrors',
  'Yellow Submarine Bubble Soap',
  'Octopus Garden Watering Can',
  'Paperback Writer Fountain Pens',
  'Blackbird Midnight Birdseed',
  'Help! Emergency Tea Biscuits',
  'Lucy in the Sky Kaleidoscopes',
  'Strawberry Fields Forever Jam',
  'Here Comes the Sun Sunhats',
  'All You Need Is Love Confetti',
  'Maxwell Silver Hammer Toy Repair',
  'Rocky Raccoon Camping Banjo Strings',
  'Hello Goodbye Revolving Doorbells',
  'Norwegian Wood Cinnamon Toothpicks',
  'Magical Mystery Tour Bus Candles',
  'Ob-La-Di Ob-La-Da Parade Whistles',
  'Across the Universe Pocket Telescopes'
];

const dylanPaymentTypes = [
  'Tambourine Trinkets',
  'Blue Suede Curios',
  'Highway 61 Oddments',
  'Rolling Stone Supplies',
  'Basement Tape Treasures'
];

const dylanPaymentSummaries = [
  'Blowin in the Wind Kites',
  'Mr Tambourine Man Bell Polish',
  'Tangled Up in Blue Shoelaces',
  'Like a Rolling Stone Pebble Wax',
  'Subterranean Homesick Alley Maps',
  'Knockin on Heaven Door Chimes',
  'Rainy Day Women Umbrella Buttons',
  'Girl from the North Country Snow Globes',
  'Forever Young Birthday Streamers',
  'It Ain Me Babe Fake Mustache Kits',
  'Shelter from the Storm Teacup Roofs',
  'Visions of Johanna Night Lamps',
  'Highway 61 Harmonica Holders',
  'Positively 4th Street Sidewalk Chalk',
  'Simple Twist of Fate Pretzel Twisters',
  'The Times They Are A Changin Wall Clocks',
  'Desolation Row Miniature Lamp Posts'
];

const sillyPaymentTypes = [
  'Leaping Lizard Cats',
  'Moon Cheese Affairs',
  'Goblin Picnic Club',
  'Thunder Goose Snacks',
  'Invisible Parasol Society'
];

const sillyPaymentSummaries = [
  'Leaping Lizard Cat Jetpacks',
  'Moon Cheese Moonwalk Boots',
  'Goblin Picnic Blanket Weights',
  'Thunder Goose Feather Combs',
  'Invisible Parasol Raindrops',
  'Banana Canoe Oar Polish',
  'Wizard Pancake Syrup Hats',
  'Marshmallow Meteor Helmets',
  'Sock Puppet Opera Tickets',
  'Cranky Unicorn Glitter Oats',
  'Sneezy Dragon Pepper Mints',
  'Biscuit Volcano Oven Mitts',
  'Cosmic Pickle Jar Choir',
  'Wobbly Walrus Roller Skates',
  'Jellybean Telescope Lenses',
  'Snoring Teapot Alarm Bells'
];

function getExpectedCashAmount(annualAmount, chargeBasis) {
  if (chargeBasis === 'per Month') {
    return annualAmount / 12;
  }

  if (chargeBasis === 'per Quarter') {
    return annualAmount / 4;
  }

  return annualAmount;
}

function getEndDate(startDate) {
  return new Date(
    Date.UTC(startDate.getUTCFullYear() + 1, startDate.getUTCMonth(), 0, 23, 59, 59, 999)
  );
}

function buildDummyRow({
  paymentType,
  paymentSummaryType,
  annualAmount,
  chargeBasis,
  startDate
}) {
  return {
    payment_type: paymentType,
    payment_summary_type: paymentSummaryType,
    expected_cash_amt: Number(getExpectedCashAmount(annualAmount, chargeBasis).toFixed(2)),
    ANNUAL_AMT: Number(annualAmount.toFixed(2)),
    CHARGE_AMT_Basis: chargeBasis,
    START_DATE: startDate.toISOString(),
    END_DATE: getEndDate(startDate).toISOString()
  };
}

function createThemeRows({
  paymentTypes,
  paymentSummaries,
  startYear,
  startMonth,
  annualBase,
  annualStep
}) {
  return paymentSummaries.map((paymentSummaryType, index) => {
    const monthIndex = startMonth + index;
    const startDate = new Date(
      Date.UTC(startYear + Math.floor(monthIndex / 12), monthIndex % 12, 1)
    );
    const chargeBasis = PAYMENT_BASIS_SEQUENCE[index % PAYMENT_BASIS_SEQUENCE.length];
    const annualAmount = annualBase + annualStep * index + (index % 4) * 11.5;

    return buildDummyRow({
      paymentType: paymentTypes[index % paymentTypes.length],
      paymentSummaryType,
      annualAmount,
      chargeBasis,
      startDate
    });
  });
}

const dummyTableRows = [
  ...createThemeRows({
    paymentTypes: beatlesPaymentTypes,
    paymentSummaries: beatlesPaymentSummaries,
    startYear: 2026,
    startMonth: 0,
    annualBase: 180,
    annualStep: 23
  }),
  ...createThemeRows({
    paymentTypes: dylanPaymentTypes,
    paymentSummaries: dylanPaymentSummaries,
    startYear: 2026,
    startMonth: 2,
    annualBase: 210,
    annualStep: 19
  }),
  ...createThemeRows({
    paymentTypes: sillyPaymentTypes,
    paymentSummaries: sillyPaymentSummaries,
    startYear: 2026,
    startMonth: 4,
    annualBase: 165,
    annualStep: 27
  })
];

if (dummyTableRows.length !== 50) {
  throw new Error(`Expected 50 dummy rows, received ${dummyTableRows.length}.`);
}

export function getDummyTableRows() {
  return dummyTableRows.map((row) => ({ ...row }));
}
