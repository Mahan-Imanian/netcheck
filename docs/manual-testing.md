# Manual testing on Windows

CI runs the unit tests, a real ICMP loopback test and an installer build on
Windows, but it can't play a game or click through an installer. These checks
need a person on a real PC. If you run one, say which in your issue or pull
request, with the Windows version (`winver`) and the Netcheck version.

## CS2 launch

1. Install Netcheck and Steam, with CS2 installed and Steam signed in.
2. Open Netcheck, wait for the check, and press Launch CS2.
3. The first time, it asks whether to close Netcheck. Choose Close it.
   - CS2 starts through Steam.
   - Netcheck closes about a second after Steam opens.
4. In Settings, set After launching CS2 to Keep it open and launch again.
   Netcheck stays open and the button reads "CS2 is starting".
5. Quit Steam and press Launch CS2. Steam starts first, then CS2.

## Windows 10

1. On Windows 10 22H2, 64-bit, run the setup `.exe` without admin rights.
2. If WebView2 is missing, the installer downloads it. Note whether that
   worked.
3. Run a check and open every tab. Note anything that looks different from
   the README screenshots, such as fonts, the title bar or window corners.
4. Run `scripts/verify-windows.ps1` and attach its output.

## Updates

This needs two published releases, the second newer than the first.

1. Install the older release with the setup `.exe` and open it.
   - After the first check, the update dialog shows the newer version and
     its notes.
   - Later closes it. It comes back on the next launch.
2. Press Update now.
   - The progress bar fills, Netcheck closes, the installer runs without
     asking anything, and Netcheck reopens on the new version (bottom right
     of the status bar).
   - Settings and history are still there.
3. Repeat with the `.msi` install. Windows asks for admin rights, and
   Netcheck doesn't reopen on its own.
4. Run the older portable `.exe`. The dialog's button says Download and
   opens the release page.
5. Set Updates to Don't check in Settings and restart. No dialog appears.
