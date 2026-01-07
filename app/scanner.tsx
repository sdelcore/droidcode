import { useState, useEffect } from 'react';
import { StyleSheet, Pressable } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';

import { Text, View } from '@/components/Themed';
import { useHostStore } from '@/stores/hostStore';
import { Colors } from '@/constants/Theme';

export default function ScannerScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const { addHost } = useHostStore();

  const handleBarCodeScanned = ({ data }: { data: string }) => {
    if (scanned) return;
    setScanned(true);

    try {
      // Parse QR code data
      // Expected format: opencode://host:port or JSON { host, port, name }
      let hostData: { name: string; host: string; port: number; isSecure: boolean };

      if (data.startsWith('opencode://')) {
        const url = data.replace('opencode://', '');
        const [host, portStr] = url.split(':');
        hostData = {
          name: host,
          host,
          port: parseInt(portStr, 10) || 4096,
          isSecure: false,
        };
      } else if (data.startsWith('{')) {
        const parsed = JSON.parse(data);
        hostData = {
          name: parsed.name || parsed.host,
          host: parsed.host,
          port: parsed.port || 4096,
          isSecure: parsed.isSecure || parsed.secure || false,
        };
      } else {
        // Try parsing as host:port
        const [host, portStr] = data.split(':');
        hostData = {
          name: host,
          host,
          port: parseInt(portStr, 10) || 4096,
          isSecure: false,
        };
      }

      addHost(hostData);
      router.back();
    } catch (error) {
      console.error('Failed to parse QR code:', error);
      setScanned(false);
    }
  };

  if (!permission) {
    return (
      <View style={styles.container}>
        <Text>Requesting camera permission...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.message}>
          Camera access is required to scan QR codes
        </Text>
        <Pressable style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Grant Permission</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={styles.camera}
        facing="back"
        barcodeScannerSettings={{
          barcodeTypes: ['qr'],
        }}
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
      >
        <View style={styles.overlay}>
          <View style={styles.scanArea}>
            <View style={[styles.corner, styles.topLeft]} />
            <View style={[styles.corner, styles.topRight]} />
            <View style={[styles.corner, styles.bottomLeft]} />
            <View style={[styles.corner, styles.bottomRight]} />
          </View>
          <Text style={styles.instructions}>
            Point at an OpenCode QR code
          </Text>
        </View>
      </CameraView>

      {scanned && (
        <Pressable
          style={styles.rescanButton}
          onPress={() => setScanned(false)}
        >
          <Text style={styles.buttonText}>Tap to Scan Again</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  camera: {
    flex: 1,
    width: '100%',
  },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  scanArea: {
    width: 250,
    height: 250,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderColor: Colors.text,
  },
  topLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 3,
    borderLeftWidth: 3,
  },
  topRight: {
    top: 0,
    right: 0,
    borderTopWidth: 3,
    borderRightWidth: 3,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 3,
    borderRightWidth: 3,
  },
  instructions: {
    marginTop: 24,
    color: Colors.text,
    fontSize: 16,
    textAlign: 'center',
  },
  message: {
    fontSize: 17,
    textAlign: 'center',
    marginBottom: 16,
    paddingHorizontal: 32,
  },
  button: {
    backgroundColor: Colors.info,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: '600',
  },
  rescanButton: {
    position: 'absolute',
    bottom: 48,
    backgroundColor: Colors.info,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
});
