/**
 * Zones of the Voi contract (Regio Amersfoort and Regio Gooi en Vechtstreek)
 * that the contract monitor on the Prestaties aanbieders page checks.
 *
 * Sources:
 * - Bedrijventerreinen: the polygons of the province's My Maps map
 *   "Deelfietslocaties Regio Amersfoort", from which the contract's map in
 *   bijlage C was made. Minimums from Tabel 4 (Eis 39).
 * - Knooppunten in Regio Amersfoort: the points of that same map.
 * - NS stations in Gooi en Vechtstreek: the rijdendetreinen.nl open station list.
 * - Points marked `unverified`: the position of a Voi hub at the site, because
 *   no source gave the stop's exact location. Check them on the map.
 */

export type ContractRegion = 'amersfoort' | 'gooi';

export interface Knooppunt {
  id: string;
  name: string;
  region: ContractRegion;
  /** [longitude, latitude] */
  point: [number, number];
  /** The point is a nearby Voi hub, not a confirmed stop location. */
  unverified?: boolean;
}

export interface Bedrijventerrein {
  id: string;
  name: string;
  region: ContractRegion;
  /** Minimum non-defect bikes at 12:00 on weekdays (Tabel 4) */
  minimum: number;
  /** Minimum number of dropzones (Voi hubs) holding a bike */
  minimumDropzones: number;
  /** Outer ring, [longitude, latitude] */
  ring: [number, number][];
}

export const REGION_NAMES: Record<ContractRegion, string> = {
  amersfoort: 'Regio Amersfoort',
  gooi: 'Regio Gooi en Vechtstreek',
};

/** Municipalities whose Voi hubs can be dropzones on a bedrijventerrein */
export const BEDRIJVENTERREIN_MUNICIPALITIES = ['GM0307', 'GM0342'];

/** "Korte loopafstand" around a knooppunt */
export const KNOOPPUNT_RADIUS_M = 300;

/** Eis 36: at least this many non-defect bikes ... */
export const KNOOPPUNT_MINIMUM = 2;
/** ... for this share of the time ... */
export const KNOOPPUNT_TARGET_SHARE = 0.8;
/** ... between these Amsterdam hours */
export const KNOOPPUNT_START_HOUR = 6;
export const KNOOPPUNT_END_HOUR = 24;

/** Eis 39: measured at 12:00 on weekdays */
export const BEDRIJVENTERREIN_HOUR = 12;

/** Eis 2 (Tabel 2): weekly average per region, Monday 0:00 to Sunday 23:59 */
export const REGION_KNOOPPUNT_MINIMUM: Record<ContractRegion, number> = {
  amersfoort: 30,
  gooi: 30,
};
export const REGION_BEDRIJVENTERREIN_MINIMUM: Record<ContractRegion, number | null> = {
  amersfoort: 70,
  gooi: null,
};

export const KNOOPPUNTEN: Knooppunt[] = [
  // Regio Amersfoort
  { id: 'amersfoort-centraal-centrum', name: 'Amersfoort Centraal (centrumzijde)', region: 'amersfoort', point: [5.3733286, 52.1530451] },
  { id: 'amersfoort-centraal-mondriaanplein', name: 'Amersfoort Centraal (Piet Mondriaanplein)', region: 'amersfoort', point: [5.37353, 52.15452] },
  { id: 'amersfoort-schothorst', name: 'Station Amersfoort Schothorst', region: 'amersfoort', point: [5.4039685, 52.1747377] },
  { id: 'amersfoort-vathorst', name: 'Station Amersfoort Vathorst', region: 'amersfoort', point: [5.43342, 52.192193] },
  { id: 'baarn', name: 'Station Baarn', region: 'amersfoort', point: [5.282726, 52.207887] },
  { id: 'soest', name: 'Station Soest', region: 'amersfoort', point: [5.3104949, 52.1725708] },
  { id: 'soest-zuid', name: 'Station Soest Zuid', region: 'amersfoort', point: [5.3031348, 52.1650552] },
  { id: 'soestdijk', name: 'Station Soestdijk', region: 'amersfoort', point: [5.2995595, 52.183689] },
  { id: 'pr-eemnes-oost', name: 'P+R Eemnes (oost)', region: 'amersfoort', point: [5.2491404, 52.2522194] },
  { id: 'pr-eemnes-west', name: 'P+R Eemnes (west)', region: 'amersfoort', point: [5.24584, 52.25312], unverified: true },
  { id: 'pr-soesterberg', name: 'P+R Soesterberg', region: 'amersfoort', point: [5.30537, 52.116927] },
  { id: 'kasteel-groeneveld', name: 'Kasteel Groeneveld', region: 'amersfoort', point: [5.2564652, 52.2188262] },
  // Regio Gooi en Vechtstreek
  { id: 'hilversum-centrum', name: 'Station Hilversum (centrumzijde)', region: 'gooi', point: [5.18083, 52.22562], unverified: true },
  { id: 'hilversum-oost', name: 'Station Hilversum (Oosterspoorplein)', region: 'gooi', point: [5.18223, 52.22744], unverified: true },
  { id: 'hilversum-media-park', name: 'Station Hilversum Media Park', region: 'gooi', point: [5.1738887, 52.2380562] },
  { id: 'hilversum-sportpark', name: 'Station Hilversum Sportpark', region: 'gooi', point: [5.187222, 52.21611] },
  { id: 'naarden-bussum', name: 'Station Naarden-Bussum', region: 'gooi', point: [5.1569443, 52.2802773] },
  { id: 'bussum-zuid', name: 'Station Bussum Zuid', region: 'gooi', point: [5.1630554, 52.2658348] },
  { id: 'pr-muiden', name: 'P+R Muiden', region: 'gooi', point: [5.0693, 52.32995], unverified: true },
  { id: 'pr-blaricum', name: 'P+R Blaricum', region: 'gooi', point: [5.26545, 52.28682], unverified: true },
  { id: 'pr-crailo', name: 'P+R Crailo', region: 'gooi', point: [5.21077, 52.26291], unverified: true },
];

export const BEDRIJVENTERREINEN: Bedrijventerrein[] = [
  {
    id: 'isselt', name: 'Isselt (Amersfoort)', region: 'amersfoort', minimum: 15, minimumDropzones: 3,
    ring: [[5.347142, 52.162185], [5.34976, 52.163277], [5.352592, 52.164198], [5.357957, 52.164699], [5.363665, 52.164093], [5.368643, 52.163119], [5.37405, 52.161408], [5.377655, 52.159749], [5.378728, 52.161987], [5.37744, 52.162672], [5.376711, 52.164883], [5.374908, 52.165883], [5.37538, 52.166804], [5.375552, 52.168121], [5.374351, 52.169647], [5.371904, 52.17149], [5.370102, 52.173911], [5.368514, 52.175122], [5.36169, 52.171621], [5.349932, 52.175543], [5.347614, 52.175806], [5.344825, 52.172937], [5.347056, 52.170068], [5.345039, 52.165488], [5.344696, 52.163909], [5.347142, 52.162185]],
  },
  {
    id: 'de-wieken-vinkenhoef', name: 'De Wieken / Vinkenhoef (Amersfoort)', region: 'amersfoort', minimum: 15, minimumDropzones: 3,
    ring: [[5.420926, 52.161723], [5.424831, 52.162631], [5.425668, 52.16117], [5.429144, 52.161788], [5.428758, 52.162578], [5.430324, 52.163039], [5.431612, 52.16375], [5.432749, 52.164868], [5.437255, 52.165553], [5.437083, 52.165961], [5.436161, 52.167066], [5.43483, 52.16754], [5.434723, 52.167909], [5.434272, 52.169501], [5.434852, 52.170554], [5.43541, 52.171054], [5.434272, 52.171515], [5.432534, 52.172449], [5.430732, 52.172712], [5.429058, 52.172344], [5.426247, 52.170304], [5.423973, 52.167566], [5.422256, 52.163987], [5.420926, 52.161723]],
  },
  {
    id: 'de-hoef', name: 'De Hoef (Amersfoort)', region: 'amersfoort', minimum: 10, minimumDropzones: 3,
    ring: [[5.423334, 52.170629], [5.424664, 52.172945], [5.425179, 52.175287], [5.423463, 52.178919], [5.417755, 52.182761], [5.410888, 52.178866], [5.411189, 52.176866], [5.41239, 52.175234], [5.413935, 52.173813], [5.415995, 52.172892], [5.420759, 52.172234], [5.422089, 52.171681], [5.422604, 52.170576], [5.423334, 52.170629]],
  },
  {
    id: 'calveen', name: 'Calveen (Amersfoort)', region: 'amersfoort', minimum: 10, minimumDropzones: 3,
    ring: [[5.382815, 52.194999], [5.386956, 52.195012], [5.392492, 52.194775], [5.399874, 52.194394], [5.40011, 52.195512], [5.39893, 52.19663], [5.39717, 52.197905], [5.395067, 52.199326], [5.393179, 52.200667], [5.388844, 52.20314], [5.388501, 52.203245], [5.388308, 52.200286], [5.390368, 52.20097], [5.391527, 52.200207], [5.389102, 52.198747], [5.385282, 52.196459], [5.382386, 52.195288], [5.382815, 52.194999]],
  },
  {
    id: 'vathorst', name: 'Vathorst (Amersfoort)', region: 'amersfoort', minimum: 10, minimumDropzones: 3,
    ring: [[5.432901, 52.186118], [5.431753, 52.184151], [5.429049, 52.183151], [5.423341, 52.183204], [5.419436, 52.184467], [5.417204, 52.185756], [5.41493, 52.187467], [5.413213, 52.188703], [5.411153, 52.190098], [5.408707, 52.191308], [5.407162, 52.193202], [5.405745, 52.195885], [5.404587, 52.197096], [5.400896, 52.195201], [5.405574, 52.191282], [5.410423, 52.187651], [5.416303, 52.183467], [5.421367, 52.18023], [5.424414, 52.17952], [5.427933, 52.180204], [5.430165, 52.181651], [5.434199, 52.18575], [5.432901, 52.186118]],
  },
  {
    id: 'soestdijkse-grachten', name: 'Soestdijkse Grachten (Soest)', region: 'amersfoort', minimum: 10, minimumDropzones: 3,
    ring: [[5.265353, 52.182818], [5.259125, 52.176959], [5.263352, 52.173077], [5.272622, 52.176788], [5.278201, 52.173893], [5.283501, 52.177808], [5.284172, 52.178403], [5.28223, 52.178884], [5.27988, 52.179824], [5.277531, 52.180844], [5.274924, 52.181995], [5.273518, 52.182476], [5.2706, 52.182995], [5.268465, 52.18339], [5.265353, 52.182818]],
  },
];
