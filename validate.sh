#!/bin/bash

# Chrome Extension 打包验证脚本
# 用于在发布前检查扩展的完整性和合规性

echo "======================================"
echo "  Chrome Extension 打包验证脚本"
echo "======================================"
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查计数
PASS=0
WARN=0
FAIL=0

# 检查文件是否存在
check_file() {
    if [ -f "$1" ]; then
        echo -e "${GREEN}✓${NC} 文件存在：$1"
        ((PASS++))
        return 0
    else
        echo -e "${RED}✗${NC} 文件缺失：$1"
        ((FAIL++))
        return 1
    fi
}

# 检查目录是否存在
check_dir() {
    if [ -d "$1" ]; then
        echo -e "${GREEN}✓${NC} 目录存在：$1"
        ((PASS++))
        return 0
    else
        echo -e "${RED}✗${NC} 目录缺失：$1"
        ((FAIL++))
        return 1
    fi
}

# 检查 manifest.json 字段
check_manifest_field() {
    local field=$1
    local value=$(grep -o "\"$field\"[^,}]*" manifest.json | head -1)
    if [ -n "$value" ]; then
        echo -e "${GREEN}✓${NC} manifest.json: $field 已配置"
        ((PASS++))
        return 0
    else
        echo -e "${YELLOW}⚠${NC} manifest.json: $field 未配置（建议添加）"
        ((WARN++))
        return 1
    fi
}

echo "1. 检查必需文件..."
echo "-------------------"
check_file "manifest.json"
check_file "background.js"
check_file "content.js"
check_file "popup.html"
check_file "popup.js"
check_file "subtitle.css"

echo ""
echo "2. 检查可选文件..."
echo "-------------------"
check_file "options.html"
check_file "options.js"
check_file "README.md"
check_file "PRIVACY.md"
check_file "STORE_LISTING.md"

echo ""
echo "3. 检查图标文件..."
echo "-------------------"
check_dir "icons"
check_file "icons/icon16.png"
check_file "icons/icon48.png"
check_file "icons/icon128.png"

echo ""
echo "4. 检查 manifest.json 配置..."
echo "-----------------------------"
check_manifest_field "manifest_version"
check_manifest_field "name"
check_manifest_field "version"
check_manifest_field "description"
check_manifest_field "permissions"
check_manifest_field "host_permissions"
check_manifest_field "action"
check_manifest_field "options_page"

echo ""
echo "5. JavaScript 语法检查..."
echo "-------------------------"

# 检查 Node.js 是否安装
if command -v node &> /dev/null; then
    for file in background.js content.js popup.js options.js; do
        if [ -f "$file" ]; then
            # 使用 node 检查语法
            node --check "$file" 2>/dev/null
            if [ $? -eq 0 ]; then
                echo -e "${GREEN}✓${NC} $file 语法正确"
                ((PASS++))
            else
                echo -e "${RED}✗${NC} $file 语法错误"
                ((FAIL++))
            fi
        fi
    done
else
    echo -e "${YELLOW}⚠${NC} Node.js 未安装，跳过语法检查"
    ((WARN++))
fi

echo ""
echo "6. JSON 语法检查..."
echo "-------------------"

if command -v python3 &> /dev/null; then
    python3 -m json.tool manifest.json > /dev/null 2>&1
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓${NC} manifest.json JSON 格式正确"
        ((PASS++))
    else
        echo -e "${RED}✗${NC} manifest.json JSON 格式错误"
        ((FAIL++))
    fi
else
    echo -e "${YELLOW}⚠${NC} Python3 未安装，跳过 JSON 检查"
    ((WARN++))
fi

echo ""
echo "======================================"
echo "  验证结果汇总"
echo "======================================"
echo -e "通过：${GREEN}$PASS${NC}"
echo -e "警告：${YELLOW}$WARN${NC}"
echo -e "失败：${RED}$FAIL${NC}"
echo ""

if [ $FAIL -gt 0 ]; then
    echo -e "${RED}验证失败！请修复上述错误后再发布。${NC}"
    exit 1
elif [ $WARN -gt 0 ]; then
    echo -e "${YELLOW}验证通过，但存在警告，建议检查。${NC}"
    exit 0
else
    echo -e "${GREEN}验证完全通过！可以发布。${NC}"
    exit 0
fi
