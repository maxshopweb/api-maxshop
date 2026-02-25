/**
 * Configuración de Jest para los tests del API MaxShop
 *
 * Cómo ejecutar:
 *   npm test                    -- todos los tests
 *   npm test -- --watch        -- modo watch
 *   npm test -- payment-processing  -- solo este archivo
 *   npm test -- --silent       -- sin console.log/error del código bajo test
 *
 * Para cambiar qué archivos se incluyen: ajustar "testMatch" abajo.
 *
 * Nota: Si aparece [JEST-01] DeprecationWarning ('id' property accessed after soft deleted),
 * es por limpieza entre archivos; los tests siguen siendo válidos. Para salida más limpia: npm test -- --silent
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.spec.ts', '**/*.spec.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts', '!src/**/__tests__/**'],
  coverageDirectory: 'coverage',
  verbose: true,
  // Timeout por test (ms); si un test tarda más, falla
  testTimeout: 10000,
  // Evitar que Jest transforme node_modules (salvo ts-jest donde haga falta)
  transformIgnorePatterns: ['/node_modules/'],
  // Directorio raíz para módulos (por si usas alias)
  moduleDirectories: ['node_modules', 'src'],
};
