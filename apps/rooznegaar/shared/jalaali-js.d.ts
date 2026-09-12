declare module "jalaali-js" {
  function toJalaali(gy: number, gm: number, gd: number): {
    jy: number;
    jm: number;
    jd: number;
  };
  function toGregorian(jy: number, jm: number, jd: number): {
    gy: number;
    gm: number;
    gd: number;
  };
  function jalaaliMonthLength(jy: number, jm: number): number;
  const jalaali: {
    toJalaali: typeof toJalaali;
    toGregorian: typeof toGregorian;
    jalaaliMonthLength: typeof jalaaliMonthLength;
  };
  export default jalaali;
}
