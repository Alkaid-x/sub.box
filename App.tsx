import React, { useState, useEffect, useRef } from 'react';
import { SafeAreaView, StyleSheet, Text, TextInput, View, Button, Switch, Platform, Alert } from 'react-native';
import AndroidShell from '@flyskywhy/react-native-android-shell';
import BackgroundService from 'react-native-background-actions';

const sleep = (time) => new Promise((resolve) => setTimeout(() => resolve(), time));

const veryIntensiveTask = async (taskDataArguments) => {
  const { url, filename } = taskDataArguments;
  await new Promise(async (resolve) => {
    for (let i = 0; BackgroundService.isRunning(); i++) {
      console.log("Running background task", i);
      try {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const configContent = await response.text();
        const targetPath = `/data/adb/box/sing-box/${filename}`;
        const command = `echo '${configContent.replace(/\'/g, "\\'")}' > ${targetPath}`;

        if (Platform.OS === 'android') {
          const writeResult = await AndroidShell.executeCommand(`su -c "${command}"`);
          if (writeResult && writeResult.includes('Permission denied')) {
            throw new Error('写入文件权限不足，请检查Root权限是否完全授权。');
          }
          console.log('后台写入结果:', writeResult);
        }
        console.log(`后台配置下载并保存成功到 ${targetPath}`);
      } catch (error) {
        console.error('后台操作失败:', error);
      }
      await sleep(taskDataArguments.interval * 60 * 1000); // Convert minutes to milliseconds
    }
  });
};

const options = {
  taskName: 'SubStoreConfigFetcher',
  taskTitle: '正在拉取Sub Store配置',
  taskDesc: '自动下载并更新Sing-box配置',
  taskIcon: {
    name: 'ic_launcher',
    type: 'mipmap',
  },
  color: '#ff00ff',
  linkingURI: 'yourApp://background',
  parameters: {
    delay: 1000,
  },
};

const App = () => {
  const [url, setUrl] = useState('');
  const [filename, setFilename] = useState('config.json');
  const [status, setStatus] = useState('');
  const [rootStatus, setRootStatus] = useState('等待Root权限...');
  const [isPeriodicFetchEnabled, setIsPeriodicFetchEnabled] = useState(false);
  const [interval, setInterval] = useState('60'); // in minutes

  const backgroundTaskRunning = useRef(false);

  useEffect(() => {
    if (Platform.OS === 'android') {
      const checkRoot = async () => {
        try {
          const result = await AndroidShell.executeCommand('su -c id');
          if (result && result.includes('uid=0(root)')) {
            setRootStatus('已获取Root权限');
          } else {
            setRootStatus('未获取Root权限，请确保设备已Root并授权');
          }
        } catch (error) {
          setRootStatus(`Root权限检查失败: ${error.message}`);
        }
      };
      checkRoot();
    }
  }, []);

  useEffect(() => {
    const toggleBackgroundFetch = async () => {
      if (isPeriodicFetchEnabled) {
        if (!url) {
          Alert.alert('错误', '请先输入Sub Store订阅链接才能开启定时拉取。');
          setIsPeriodicFetchEnabled(false);
          return;
        }
        if (Platform.OS === 'android' && rootStatus !== '已获取Root权限') {
          Alert.alert('错误', '未获取Root权限，无法开启定时拉取到系统目录。');
          setIsPeriodicFetchEnabled(false);
          return;
        }
        if (backgroundTaskRunning.current) {
          await BackgroundService.stop();
          backgroundTaskRunning.current = false;
        }
        await BackgroundService.start(veryIntensiveTask, { ...options, parameters: { url, filename, interval: parseInt(interval, 10) } });
        backgroundTaskRunning.current = true;
        setStatus(`已开启定时拉取，每 ${interval} 分钟更新一次。`);
      } else {
        if (backgroundTaskRunning.current) {
          await BackgroundService.stop();
          backgroundTaskRunning.current = false;
          setStatus('已关闭定时拉取。');
        }
      }
    };
    toggleBackgroundFetch();

    return () => {
      if (backgroundTaskRunning.current) {
        BackgroundService.stop();
      }
    };
  }, [isPeriodicFetchEnabled, url, filename, interval, rootStatus]);

  const handleDownload = async () => {
    if (!url) {
      setStatus('请输入Sub Store订阅链接');
      return;
    }
    if (Platform.OS === 'android' && rootStatus !== '已获取Root权限') {
      setStatus('未获取Root权限，无法写入系统目录');
      return;
    }

    setStatus('正在下载配置...');
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const configContent = await response.text();
      
      const targetPath = `/data/adb/box/sing-box/${filename}`;
      const command = `echo '${configContent.replace(/\'/g, "\\'")}' > ${targetPath}`;
      
      setStatus('正在写入配置文件...');
      if (Platform.OS === 'android') {
        const writeResult = await AndroidShell.executeCommand(`su -c "${command}"`);
        if (writeResult && writeResult.includes('Permission denied')) {
          throw new Error('写入文件权限不足，请检查Root权限是否完全授权。');
        }
        console.log('写入结果:', writeResult);
      }
      
      setStatus(`配置下载并保存成功到 ${targetPath}`);
    } catch (error) {
      console.error('操作失败:', error);
      setStatus(`操作失败: ${error.message}`);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.innerContainer}>
        <Text style={styles.title}>Sub Store 配置下载器</Text>
        {Platform.OS === 'android' && <Text style={styles.rootStatus}>{rootStatus}</Text>}
        <TextInput
          style={styles.input}
          onChangeText={setUrl}
          value={url}
          placeholder="请输入Sub Store订阅链接"
        />
        <TextInput
          style={styles.input}
          onChangeText={setFilename}
          value={filename}
          placeholder="请输入自定义文件名 (例如: config.json)"
        />
        <Button title="立即下载并保存配置" onPress={handleDownload} />
        <View style={styles.periodicContainer}>
          <Text>定时拉取</Text>
          <Switch
            trackColor={{ false: "#767577", true: "#81b0ff" }}
            thumbColor={isPeriodicFetchEnabled ? "#f5dd4b" : "#f4f3f4"}
            ios_backgroundColor="#3e3e3e"
            onValueChange={setIsPeriodicFetchEnabled}
            value={isPeriodicFetchEnabled}
          />
        </View>
        {isPeriodicFetchEnabled && (
          <View style={styles.intervalContainer}>
            <Text>拉取间隔（分钟）:</Text>
            <TextInput
              style={styles.input}
              onChangeText={text => setInterval(text.replace(/[^0-9]/g, ''))} // Only allow numeric input
              value={interval}
              keyboardType="numeric"
            />
          </View>
        )}
        <Text style={styles.status}>{status}</Text>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  innerContainer: {
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  rootStatus: {
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
    color: '#888',
  },
  input: {
    height: 40,
    borderColor: 'gray',
    borderWidth: 1,
    marginBottom: 10,
    paddingHorizontal: 10,
    borderRadius: 5,
  },
  status: {
    marginTop: 20,
    textAlign: 'center',
    color: 'green',
  },
  periodicContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  intervalContainer: {
    marginTop: 10,
  },
});

export default App;

