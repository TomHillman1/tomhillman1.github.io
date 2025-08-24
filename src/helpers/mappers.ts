export const mapNumbertoChar = (num: string) => {
    let numInt = parseInt(num);
    return String.fromCharCode(96 + numInt).toUpperCase();
}