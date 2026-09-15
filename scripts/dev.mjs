// Starts the dev server with the right LAN address, worked out automatically.
//
// Run with: npm run dev
//
// This exists because of a problem that cost real time three times over. Expo
// has to advertise an address for the phone to fetch JavaScript from, and on
// this machine it kept choosing the wrong one: Windows has a virtual adapter
// for WSL (172.25.x.x) that exists only INSIDE the laptop, so a phone told to
// use it waits forever on a blue spinner with no error.
//
// The manual fix was to set REACT_NATIVE_PACKAGER_HOSTNAME by hand before
// every start. That works and is forgettable — the variable lives only in the
// terminal window it was typed in, so closing the window silently undoes it.
// And the correct value CHANGES: the router leases addresses, so the laptop
// has been .23 and .4 on different days.
//
// So: detect the real address every time rather than remember a stale one.

import { networkInterfaces } from "node:os";
import { spawn } from "node:child_process";

// Ranges used by virtual adapters — WSL, Hyper-V, Docker, VirtualBox. These
// are real addresses on real interfaces, which is exactly why Expo picks them
// by mistake; they simply are not reachable from anything outside this laptop.
function isVirtual(address, name) {
  if (address.startsWith("172.")) {
    const second = Number(address.split(".")[1]);
    if (second >= 16 && second <= 31) return true; // Docker/WSL/Hyper-V
  }
  if (address.startsWith("169.254.")) return true; // link-local, no DHCP
  return /vethernet|wsl|hyper-v|docker|virtualbox|vmware|loopback/i.test(name);
}

function findLanAddress() {
  const interfaces = networkInterfaces();
  const candidates = [];

  for (const [name, addrs] of Object.entries(interfaces)) {
    for (const addr of addrs ?? []) {
      if (addr.family !== "IPv4" || addr.internal) continue;
      if (isVirtual(addr.address, name)) continue;
      // Prefer a Wi-Fi adapter when there is one — the phone is on Wi-Fi, and
      // an ethernet-connected laptop may sit on a different subnet entirely.
      const score = /wi-?fi|wlan|wireless/i.test(name) ? 0 : 1;
      candidates.push({ name, address: addr.address, score });
    }
  }

  candidates.sort((a, b) => a.score - b.score);
  return candidates[0] ?? null;
}

const found = findLanAddress();

if (!found) {
  console.error(
    "\nCould not find a LAN address for this machine.\n" +
      "Is Wi-Fi connected? Run `ipconfig` and look for an IPv4 address under\n" +
      "your Wi-Fi adapter, then start Expo by hand with:\n" +
      '  $env:REACT_NATIVE_PACKAGER_HOSTNAME = "<that address>"\n' +
      "  npx expo start --dev-client\n"
  );
  process.exit(1);
}

console.log(`\nServing to phones at ${found.address}  (via ${found.name})`);
console.log("Make sure the phone is on the SAME Wi-Fi network.\n");

// --dev-client because this project uses a development build, not Expo Go.
const child = spawn(
  "npx",
  ["expo", "start", "--dev-client", ...process.argv.slice(2)],
  {
    stdio: "inherit",
    shell: true,
    env: { ...process.env, REACT_NATIVE_PACKAGER_HOSTNAME: found.address },
  }
);

child.on("exit", (code) => process.exit(code ?? 0));
