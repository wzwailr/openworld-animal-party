/** 第三方动物模型署名（CC-BY 3.0，需在「关于」中展示）。 */

export interface ModelCredit {
  /** 场景内中文名，便于家长/儿童对照 */
  animal: string;
  title: string;
  url: string;
}

export const MODEL_LICENSE = 'CC-BY 3.0';
export const MODEL_AUTHOR = 'Poly by Google';
export const MODEL_LICENSE_URL = 'https://creativecommons.org/licenses/by/3.0';

export const MODEL_CREDITS: readonly ModelCredit[] = [
  // 兔子（指挥家）为项目原创程序化模型（tools/blender/make_conductor_rabbit_v2.py 生成，体素融合建模），无第三方署名
  { animal: '松鼠', title: 'Squirrel', url: 'https://poly.pizza/m/caxos24uWC9' },
  { animal: '刺猬', title: 'Hedgehog', url: 'https://poly.pizza/m/8UNni5IvK_c' },
  { animal: '狐狸', title: 'Fox', url: 'https://poly.pizza/m/10u8FYPC5Br' },
  { animal: '水獭', title: 'River otter', url: 'https://poly.pizza/m/dJW3JeUWXQ-' },
  { animal: '浣熊', title: 'Raccoon', url: 'https://poly.pizza/m/2iYORwFng3_' },
  { animal: '鹿', title: 'Deer', url: 'https://poly.pizza/m/fUo4AIcd8XR' },
  { animal: '猫头鹰', title: 'Great horned owl', url: 'https://poly.pizza/m/fNk9qCwSG6d' },
  { animal: '青蛙', title: 'Tree frog', url: 'https://poly.pizza/m/cwyNyIba6WE' }
];
