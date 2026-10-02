# Activate a zh-CN text input processor for the whole input session (TSF), so IME runs are not silently using another IME.
# usage: h7-set-tip.ps1 -Which ms|sogou     (CLSIDs/profile GUIDs are the public registry identifiers of each text service)
param([ValidateSet("ms", "sogou")][string]$Which = "ms")
$ErrorActionPreference = "Stop"
Add-Type @'
using System; using System.Runtime.InteropServices;
[ComImport, Guid("71c6e74c-0f28-11d8-a82a-00065b84435c"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface ITfInputProcessorProfileMgr {
  [PreserveSig] int ActivateProfile(uint dwProfileType, ushort langid, ref Guid clsid, ref Guid guidProfile, IntPtr hkl, uint dwFlags);
}
public static class Tsf {
  public static int Activate(string clsid, string profile) {
    var t = Type.GetTypeFromCLSID(new Guid("33C53A50-F456-4884-B049-85FD643ECFED"));
    var mgr = (ITfInputProcessorProfileMgr)Activator.CreateInstance(t);
    Guid c = new Guid(clsid), p = new Guid(profile);
    return mgr.ActivateProfile(1, 0x0804, ref c, ref p, IntPtr.Zero, 0x20000001u); // FORSESSION | ENABLEPROFILE
  }
}
'@
if ($Which -eq "ms") { $hr = [Tsf]::Activate("{81D4E9C9-1D3B-41BC-9E6C-4B40BF79E35E}", "{FA550B04-5AD7-411F-A5AC-CA038EC515D7}") }
else { $hr = [Tsf]::Activate("{E7EA138E-69F8-11D7-A6EA-00065B844310}", "{E7EA138F-69F8-11D7-A6EA-00065B844311}") }
"ActivateProfile($Which) HRESULT=0x{0:X8}" -f $hr
