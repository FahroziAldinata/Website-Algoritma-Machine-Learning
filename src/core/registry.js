/**
 * src/core/registry.js
 * Algorithm Registry Module
 * 
 * Tujuan: Menyediakan repositori terpusat untuk mendaftarkan dan memvalidasi plugin algoritma.
 * Menghindari pemanggilan erat (tight coupling) dengan membiarkan Core SPA memanggil
 * plugin melalui registry secara dinamis.
 */

class PluginRegistry {
  constructor() {
    this.plugins = new Map();
  }

  /**
   * Mendaftarkan plugin baru ke dalam sistem
   * @param {AlgorithmPlugin} plugin - Objek instance plugin
   */
  register(plugin) {
    // Validasi tipe instance
    if (!(plugin instanceof AlgorithmPlugin)) {
      throw new Error('Validasi Gagal: Plugin wajib mewarisi kelas AlgorithmPlugin.');
    }
    
    // Validasi field wajib
    if (!plugin.id) throw new Error('Validasi Gagal: Plugin wajib memiliki properti [id] yang unik.');
    if (!plugin.name) throw new Error(`Validasi Gagal: Plugin [${plugin.id}] wajib memiliki properti [name].`);
    if (!plugin.configSchema) throw new Error(`Validasi Gagal: Plugin [${plugin.id}] wajib mendefinisikan [configSchema].`);

    this.plugins.set(plugin.id, plugin);
    console.log(`Plugin Registered successfully: [${plugin.id}] — ${plugin.name}`);
  }

  /**
   * Mengambil plugin berdasarkan ID
   * @param {string} id - ID unik plugin
   * @returns {AlgorithmPlugin|undefined} Instance plugin
   */
  get(id) {
    return this.plugins.get(id);
  }

  /**
   * Mengambil seluruh daftar plugin yang terdaftar
   * @returns {AlgorithmPlugin[]} Array daftar instance plugin
   */
  getAll() {
    return Array.from(this.plugins.values());
  }
}

// Singleton registry instance
const registry = new PluginRegistry();

if (typeof window !== 'undefined') {
  window.registry = registry;
} else if (typeof self !== 'undefined') {
  self.registry = registry;
}
