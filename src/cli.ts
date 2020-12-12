import program from 'commander'

program
  .name('vue-classify')
  .version('1.0.0')
  .parse(process.argv)

console.log(program.helpInformation())
